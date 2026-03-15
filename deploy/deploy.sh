#!/bin/bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REGION="us-east-2"
APP="proof-of-spy"
KEY_NAME="${APP}-key"
SG_NAME="${APP}-sg"
INSTANCE_TYPE="t3.small"
DB_INSTANCE_CLASS="db.t3.micro"
DB_NAME="guess_who"
DB_USER="appuser"
DB_PASS="$(openssl rand -base64 16 | tr -d /=+)"

# Load secrets from .env
source "$(dirname "$0")/../.env"
WALLET_SEED_VAL="${WALLET_SEED}"
CONTRACT_ADDRESS="${GUESS_WHO_CONTRACT_ADDRESS}"
POOL_SIZE="${POOL_TARGET_SIZE:-10}"
PROOF_SERVER_URL="https://lace-proof-pub.preprod.midnight.network"

echo "==> Deploying ${APP} to ${REGION}"

# ── 1. Key pair ───────────────────────────────────────────────────────────────
if ! aws ec2 describe-key-pairs --key-names "${KEY_NAME}" --region "${REGION}" &>/dev/null; then
  echo "--> Creating key pair ${KEY_NAME}"
  aws ec2 create-key-pair \
    --key-name "${KEY_NAME}" \
    --region "${REGION}" \
    --query 'KeyMaterial' \
    --output text > "${HOME}/.ssh/${KEY_NAME}.pem"
  chmod 600 "${HOME}/.ssh/${KEY_NAME}.pem"
  echo "    Saved to ~/.ssh/${KEY_NAME}.pem"
else
  echo "--> Key pair ${KEY_NAME} already exists"
fi

# ── 2. VPC / Subnets ──────────────────────────────────────────────────────────
VPC_ID=$(aws ec2 describe-vpcs \
  --region "${REGION}" \
  --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' \
  --output text)
echo "--> VPC: ${VPC_ID}"

SUBNET_IDS=$(aws ec2 describe-subnets \
  --region "${REGION}" \
  --filters "Name=vpc-id,Values=${VPC_ID}" "Name=defaultForAz,Values=true" \
  --query 'Subnets[*].SubnetId' \
  --output text)
SUBNET_1=$(echo "${SUBNET_IDS}" | awk '{print $1}')
SUBNET_2=$(echo "${SUBNET_IDS}" | awk '{print $2}')

# ── 3. Security groups ────────────────────────────────────────────────────────
EXISTING_SG=$(aws ec2 describe-security-groups \
  --region "${REGION}" \
  --filters "Name=group-name,Values=${SG_NAME}" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null)

if [ -z "${EXISTING_SG}" ] || [ "${EXISTING_SG}" = "None" ]; then
  echo "--> Creating EC2 security group"
  SG_ID=$(aws ec2 create-security-group \
    --group-name "${SG_NAME}" \
    --description "Proof of Spy game server" \
    --vpc-id "${VPC_ID}" \
    --region "${REGION}" \
    --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress --group-id "${SG_ID}" --region "${REGION}" \
    --ip-permissions \
      "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=0.0.0.0/0}]" \
      "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]" \
      "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]"
else
  SG_ID="${EXISTING_SG}"
  echo "--> Reusing EC2 security group: ${SG_ID}"
fi

RDS_SG_NAME="${APP}-rds-sg"
EXISTING_RDS_SG=$(aws ec2 describe-security-groups \
  --region "${REGION}" \
  --filters "Name=group-name,Values=${RDS_SG_NAME}" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null)

if [ -z "${EXISTING_RDS_SG}" ] || [ "${EXISTING_RDS_SG}" = "None" ]; then
  echo "--> Creating RDS security group"
  RDS_SG_ID=$(aws ec2 create-security-group \
    --group-name "${RDS_SG_NAME}" \
    --description "Proof of Spy RDS - EC2 only" \
    --vpc-id "${VPC_ID}" \
    --region "${REGION}" \
    --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress \
    --group-id "${RDS_SG_ID}" \
    --region "${REGION}" \
    --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=${SG_ID}}]"
else
  RDS_SG_ID="${EXISTING_RDS_SG}"
  echo "--> Reusing RDS security group: ${RDS_SG_ID}"
fi

# ── 4. RDS Postgres ───────────────────────────────────────────────────────────
DB_SUBNET_GROUP="${APP}-db-subnet"
aws rds describe-db-subnet-groups \
  --db-subnet-group-name "${DB_SUBNET_GROUP}" \
  --region "${REGION}" &>/dev/null || \
aws rds create-db-subnet-group \
  --db-subnet-group-name "${DB_SUBNET_GROUP}" \
  --db-subnet-group-description "Proof of Spy subnet group" \
  --subnet-ids "${SUBNET_1}" "${SUBNET_2}" \
  --region "${REGION}" > /dev/null

DB_INSTANCE_ID="${APP}-db"
if ! aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --region "${REGION}" &>/dev/null; then
  echo "--> Creating RDS instance (takes ~5 min)..."
  aws rds create-db-instance \
    --db-instance-identifier "${DB_INSTANCE_ID}" \
    --db-instance-class "${DB_INSTANCE_CLASS}" \
    --engine postgres \
    --engine-version "16.13" \
    --master-username "${DB_USER}" \
    --master-user-password "${DB_PASS}" \
    --db-name "${DB_NAME}" \
    --allocated-storage 20 \
    --storage-type gp2 \
    --no-multi-az \
    --no-publicly-accessible \
    --vpc-security-group-ids "${RDS_SG_ID}" \
    --db-subnet-group-name "${DB_SUBNET_GROUP}" \
    --backup-retention-period 0 \
    --region "${REGION}" > /dev/null
  echo "--> Waiting for RDS..."
  aws rds wait db-instance-available \
    --db-instance-identifier "${DB_INSTANCE_ID}" \
    --region "${REGION}"
else
  echo "--> RDS already exists, fetching password from SSM"
  DB_PASS=$(aws ssm get-parameter \
    --name "/${APP}/db-password" \
    --with-decryption \
    --region "${REGION}" \
    --query 'Parameter.Value' \
    --output text)
fi

DB_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --region "${REGION}" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)
echo "--> RDS: ${DB_HOST}"

# Store password in SSM
aws ssm put-parameter \
  --name "/${APP}/db-password" \
  --value "${DB_PASS}" \
  --type SecureString \
  --overwrite \
  --region "${REGION}" > /dev/null

POSTGRES_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}"

# ── 5. Latest Amazon Linux 2023 AMI ──────────────────────────────────────────
AMI_ID=$(aws ec2 describe-images \
  --region "${REGION}" \
  --owners amazon \
  --filters \
    "Name=name,Values=al2023-ami-2023.*-x86_64" \
    "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)
echo "--> AMI: ${AMI_ID}"

# ── 6. User-data: install runtime + write env + configure nginx + systemd ──────
# Code is NOT cloned here — GitHub Actions will deploy the app later.
# This just prepares the server environment.
cat > /tmp/${APP}-userdata.sh << USERDATA
#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/app-init.log) 2>&1

echo "=== [1/4] System update ==="
dnf update -y

echo "=== [2/4] Install Node 22 + Nginx + git ==="
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs nginx git
node --version
npm --version
systemctl enable nginx

echo "=== [3/4] Write app environment ==="
APP_DIR="/opt/${APP}"
mkdir -p "\${APP_DIR}"

cat > "\${APP_DIR}/.env" << 'ENVEOF'
VITE_CONTRACT_ADDRESS=${CONTRACT_ADDRESS}
VITE_API_URL=http://localhost:3001
WALLET_SEED=${WALLET_SEED_VAL}
GUESS_WHO_CONTRACT_ADDRESS=${CONTRACT_ADDRESS}
POSTGRES_URL=${POSTGRES_URL}
POOL_TARGET_SIZE=${POOL_SIZE}
PROOF_SERVER_URL=${PROOF_SERVER_URL}
ENVEOF

echo "=== [4/4] Configure Nginx + systemd ==="

cat > /etc/nginx/conf.d/${APP}.conf << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    root /opt/${APP}/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /sponsor {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
NGINXEOF

# Remove default nginx config
rm -f /etc/nginx/conf.d/default.conf
systemctl restart nginx

cat > /etc/systemd/system/${APP}.service << 'SVCEOF'
[Unit]
Description=Proof of Spy game server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/${APP}/server
EnvironmentFile=/opt/${APP}/.env
ExecStart=/usr/bin/node --experimental-specifier-resolution=node --import tsx/esm src/preprod.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP}

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable ${APP}
# Service will start once code is deployed via GitHub Actions

echo "=== Server ready for code deployment ==="
USERDATA

# ── 7. Launch EC2 ─────────────────────────────────────────────────────────────
EXISTING_INSTANCE=$(aws ec2 describe-instances \
  --region "${REGION}" \
  --filters "Name=tag:Name,Values=${APP}" "Name=instance-state-name,Values=running,stopped,pending" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null)

if [ -z "${EXISTING_INSTANCE}" ] || [ "${EXISTING_INSTANCE}" = "None" ]; then
  echo "--> Launching EC2 instance..."
  INSTANCE_ID=$(aws ec2 run-instances \
    --region "${REGION}" \
    --image-id "${AMI_ID}" \
    --instance-type "${INSTANCE_TYPE}" \
    --key-name "${KEY_NAME}" \
    --security-group-ids "${SG_ID}" \
    --subnet-id "${SUBNET_1}" \
    --associate-public-ip-address \
    --user-data file:///tmp/${APP}-userdata.sh \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3}' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${APP}}]" \
    --query 'Instances[0].InstanceId' \
    --output text)
  echo "--> Waiting for instance to be running..."
  aws ec2 wait instance-running --instance-ids "${INSTANCE_ID}" --region "${REGION}"
else
  INSTANCE_ID="${EXISTING_INSTANCE}"
  echo "--> Instance already exists: ${INSTANCE_ID}"
fi

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "${INSTANCE_ID}" \
  --region "${REGION}" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  INFRASTRUCTURE READY"
echo "════════════════════════════════════════════════════════════"
echo "  Instance ID:  ${INSTANCE_ID}"
echo "  Public IP:    ${PUBLIC_IP}"
echo "  SSH:          ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
echo "  RDS host:     ${DB_HOST}"
echo "  Init log:     ssh in → sudo tail -f /var/log/app-init.log"
echo ""
echo "  Next: set these as GitHub Actions secrets:"
echo "    EC2_HOST=${PUBLIC_IP}"
echo "    EC2_SSH_KEY=\$(cat ~/.ssh/${KEY_NAME}.pem)"
echo "════════════════════════════════════════════════════════════"
