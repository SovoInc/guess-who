module.exports = {
  apps: [{
    name: 'proof-of-spy',
    script: 'src/mainnet.ts',
    interpreter: 'node',
    interpreter_args: '--experimental-specifier-resolution=node --import tsx/esm',
    cwd: '/opt/proof-of-spy/server',
    env_file: '/opt/proof-of-spy/.env',
    restart_delay: 5000,
    max_restarts: 10,
    out_file: '/home/ec2-user/.pm2/logs/proof-of-spy-out.log',
    error_file: '/home/ec2-user/.pm2/logs/proof-of-spy-error.log',
  }]
};
