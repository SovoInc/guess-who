import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { applyCRTOverlay, addFlickerTween } from '../utils/crt.js';
import { startSession, getScores, getNetworkStatus, getProofServerMode, setProofServerMode } from '../api.js';
import { getAddress, connectLace } from '../wallet.js';
import { SoundSynth } from '../audio/SoundSynth.js';

const MENU_ITEMS = ['START MISSION', 'HIGH SCORES', 'ABOUT'];

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.selectedIndex = 0;
    this.overlay = null;
    this.menuReady = true;
    this._connecting = false;
  }

  create() {
    // Crosshair cursor — injected as a style tag to override Phaser's useHandCursor
    // Pixel art crosshair — blocky squares, no anti-aliasing
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48' shape-rendering='crispEdges'>`
      + `<rect x='22' y='2' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='22' y='8' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='22' y='14' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='22' y='30' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='22' y='36' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='22' y='42' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='2' y='22' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='8' y='22' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='14' y='22' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='30' y='22' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='36' y='22' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='42' y='22' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='18' y='18' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='26' y='18' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='18' y='26' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='26' y='26' width='4' height='4' fill='%2300ff41'/>`
      + `<rect x='22' y='22' width='4' height='4' fill='%2300ff41'/>`
      + `</svg>`;
    const cursorUrl = `url("data:image/svg+xml,${svg}") 24 24, crosshair`;
    this._cursorStyle = document.createElement('style');
    this._cursorStyle.id = 'menu-crosshair';
    this._cursorStyle.textContent = `canvas { cursor: ${cursorUrl} !important; }`;
    document.head.appendChild(this._cursorStyle);

    if (!this.registry.get('sound')) {
      this.registry.set('sound', new SoundSynth());
    }
    this.sound = this.registry.get('sound');
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.BG);

    // Decorative grid lines
    const gridGfx = this.add.graphics();
    gridGfx.lineStyle(1, COLORS.BORDER, 0.5);
    for (let x = 0; x < GAME_WIDTH; x += 80) gridGfx.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 80) gridGfx.lineBetween(0, y, GAME_WIDTH, y);

    // Title
    const title = this.add.text(GAME_WIDTH / 2, 160, 'PROOF OF SPY', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '36px',
      color: '#00ff41',
      align: 'center',
      lineSpacing: 12,
    }).setOrigin(0.5);
    title.setShadow(0, 0, '#00ff41', 16, true, true);
    addFlickerTween(this, title);

    this.add.text(GAME_WIDTH / 2, 260, '// IDENTIFY THE SPY //', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '10px',
      color: '#00aa22',
      align: 'center',
    }).setOrigin(0.5);

    // ── Top-right wallet connect button ──
    this._buildWalletButton();
    this._buildNetworkStatus();
    this._buildMuteButton(20, 20);

    // If address is in session but wallet not in memory (e.g. after page refresh), auto-reconnect
    if (getAddress() && !window.__midnightConnectedApi) {
      this._connectWallet();
    }

    // Menu items
    this.menuTexts = MENU_ITEMS.map((label, i) => {
      const disabled = this._isDisabled(i);
      const t = this.add.text(GAME_WIDTH / 2, 330 + i * 52, label, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '13px',
        color: disabled ? '#003300' : '#00aa22',
        align: 'center',
      }).setOrigin(0.5);
      if (!disabled) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerover', () => {
          this.selectedIndex = i;
          this._updateSelection();
          if (this.sound) this.sound.menuSelect();
        });
        t.on('pointerdown', () => this._select());
      }
      return t;
    });

    // Arrow cursor
    this.arrowText = this.add.text(0, 0, '>', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '13px',
      color: '#00ff41',
    }).setOrigin(1, 0.5);

    // Start with selection on first enabled item
    this.selectedIndex = this._isDisabled(0) ? 1 : 0;
    this._updateSelection();

    // Keyboard nav
    this.input.keyboard.on('keydown-UP',    () => this._move(-1));
    this.input.keyboard.on('keydown-DOWN',  () => this._move(1));
    this.input.keyboard.on('keydown-W',     () => this._move(-1));
    this.input.keyboard.on('keydown-S',     () => this._move(1));
    this.input.keyboard.on('keydown-ENTER', () => this._select());

    // Version footer
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'PROOF OF SPY ZK PROOF DEMO — v1.0.0', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00aa22',
      align: 'center',
    }).setOrigin(0.5);

    applyCRTOverlay(this);
  }

  _buildWalletButton() {
    const addr = getAddress();
    const PAD = 20;

    if (this._walletBtn) this._walletBtn.destroy();
    if (this._walletBtnBg) this._walletBtnBg.destroy();

    if (addr) {
      const label = `${addr.slice(0, 8)}...${addr.slice(-8)}`;
      const t = this.add.text(GAME_WIDTH - PAD, PAD, `◈ ${label}`, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '11px',
        color: '#00ff41',
      }).setOrigin(1, 0).setDepth(10);
      this._walletBtn = t;
    } else {
      const t = this.add.text(GAME_WIDTH - PAD, PAD, '[ CONNECT WALLET ]', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '11px',
        color: '#00aa22',
      }).setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#00ff41'));
      t.on('pointerout',  () => t.setColor('#00aa22'));
      t.on('pointerdown', () => this._connectWallet());
      this._walletBtn = t;
    }
  }

  _buildNetworkStatus() {
    if (this._netStatusGroup) {
      this._netStatusGroup.forEach(o => o.destroy());
    }
    this._netStatusGroup = [];
    this._netDropdownOpen = false;

    const PAD = 20;
    const btnY = 52;

    // "NETWORK ▾" toggle button
    const btn = this.add.text(GAME_WIDTH - PAD, btnY, 'NETWORK ▾', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#ff4444',
    }).setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setAlpha(0.75));
    btn.on('pointerout',  () => btn.setAlpha(1));
    btn.on('pointerdown', () => this._toggleNetworkDropdown(btn));

    this._netStatusGroup.push(btn);
    this._netStatusBtn = btn;

    // Kick off a status check immediately
    this._refreshNetworkStatus();
    this._refreshProofServerMode();
  }

  async _refreshProofServerMode() {
    this._proofServerMode = this._proofServerMode ?? 'remote'; // default before fetch
    try {
      const { mode } = await getProofServerMode();
      this._proofServerMode = mode;
      if (this._netDropdownOpen) this._renderDropdown();
    } catch {
      // keep existing value
    }
  }

  async _refreshNetworkStatus() {
    try {
      const status = await getNetworkStatus();
      this._lastNetStatus = status;
      const allOk = status.gameServer && status.proofServer && status.node && status.indexer;
      if (this._netStatusBtn) {
        this._netStatusBtn.setColor(allOk ? '#00ff41' : '#ff8800');
      }
      if (this._netDropdownOpen) {
        this._renderDropdown();
      }
    } catch {
      this._lastNetStatus = { gameServer: false, proofServer: false, node: false, indexer: false };
      if (this._netStatusBtn) this._netStatusBtn.setColor('#ff4444');
      if (this._netDropdownOpen) this._renderDropdown();
    }
  }

  _toggleNetworkDropdown(btn) {
    if (this._netDropdownOpen) {
      this._closeNetworkDropdown();
    } else {
      this._netDropdownOpen = true;
      btn.setColor('#00ff41');
      this._renderDropdown();
      this._refreshNetworkStatus();

      // Close when clicking anywhere outside the dropdown
      this._outsideClickHandler = (pointer) => {
        if (!this._netDropdownOpen) return;
        // Check if click is within the dropdown panel bounds
        const PAD = 20;
        const panelW = 220;
        const panelX = GAME_WIDTH - PAD - panelW;
        const startY = 52; // includes the button itself
        const panelH = 200; // generous height covering all rows
        if (pointer.x >= panelX && pointer.x <= panelX + panelW + PAD &&
            pointer.y >= startY && pointer.y <= startY + panelH) return;
        this._closeNetworkDropdown();
      };
      this.input.on('pointerdown', this._outsideClickHandler);
    }
  }

  _renderDropdown() {
    // Remove old dropdown objects
    if (this._dropdownObjs) this._dropdownObjs.forEach(o => o.destroy());
    this._dropdownObjs = [];

    const PAD = 20;
    const startY = 72;
    const status = this._lastNetStatus || {};
    const items = [
      { label: 'GAME SERVER',  key: 'gameServer' },
      { label: 'PROOF SERVER', key: 'proofServer' },
      { label: 'NODE',         key: 'node' },
      { label: 'INDEXER',      key: 'indexer' },
    ];

    const rowH = 22;
    const toggleH = 30;
    const panelW = 220;
    const panelH = items.length * rowH + toggleH + 24;
    const panelX = GAME_WIDTH - PAD - panelW;

    const bg = this.add.graphics().setDepth(20);
    bg.fillStyle(0x001a00, 0.97);
    bg.fillRect(panelX, startY, panelW, panelH);
    bg.lineStyle(1, 0x00aa22, 1);
    bg.strokeRect(panelX, startY, panelW, panelH);
    this._dropdownObjs.push(bg);

    items.forEach(({ label, key }, i) => {
      const ok = status[key];
      const dot = ok ? '● ' : '○ ';
      const color = ok ? '#00ff41' : '#ff4444';
      const t = this.add.text(panelX + 10, startY + 8 + i * rowH, `${dot}${label}`, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
        color,
      }).setDepth(21);
      this._dropdownObjs.push(t);
    });

    // Divider
    const divY = startY + 8 + items.length * rowH + 4;
    const divGfx = this.add.graphics().setDepth(21);
    divGfx.lineStyle(1, 0x003300, 1);
    divGfx.lineBetween(panelX + 6, divY, panelX + panelW - 6, divY);
    this._dropdownObjs.push(divGfx);

    // Proof server toggle
    const mode = this._proofServerMode;
    const toggleY = divY + 6;
    const isLocal = mode === 'local';
    const isRemote = mode === 'remote';

    const modeLabel = this.add.text(panelX + 10, toggleY, 'PROOF:', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00aa22',
    }).setDepth(21);
    this._dropdownObjs.push(modeLabel);

    // LOCAL button
    const localBtnX = panelX + 70;
    const localGfx = this.add.graphics().setDepth(21);
    const drawLocal = (hover) => {
      localGfx.clear();
      localGfx.fillStyle(isLocal ? 0x003300 : (hover ? 0x001a00 : 0x000a00), 1);
      localGfx.fillRect(localBtnX, toggleY - 2, 58, 16);
      localGfx.lineStyle(1, isLocal ? 0x00ff41 : 0x005500, 1);
      localGfx.strokeRect(localBtnX, toggleY - 2, 58, 16);
    };
    drawLocal(false);
    const localText = this.add.text(localBtnX + 29, toggleY + 6, 'LOCAL', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: isLocal ? '#00ff41' : '#006600',
    }).setOrigin(0.5, 0.5).setDepth(22);
    const localHit = this.add.rectangle(localBtnX + 29, toggleY + 6, 58, 16, 0, 0)
      .setDepth(22).setInteractive({ useHandCursor: true });
    localHit.on('pointerover', () => { drawLocal(true); });
    localHit.on('pointerout',  () => { drawLocal(false); });
    localHit.on('pointerdown', async () => {
      if (isLocal) return;
      await setProofServerMode('local').catch(() => {});
      this._proofServerMode = 'local';
      this._renderDropdown();
    });
    this._dropdownObjs.push(localGfx, localText, localHit);

    // REMOTE button
    const remoteBtnX = localBtnX + 64;
    const remoteGfx = this.add.graphics().setDepth(21);
    const drawRemote = (hover) => {
      remoteGfx.clear();
      remoteGfx.fillStyle(isRemote ? 0x003300 : (hover ? 0x001a00 : 0x000a00), 1);
      remoteGfx.fillRect(remoteBtnX, toggleY - 2, 72, 16);
      remoteGfx.lineStyle(1, isRemote ? 0x00ff41 : 0x005500, 1);
      remoteGfx.strokeRect(remoteBtnX, toggleY - 2, 72, 16);
    };
    drawRemote(false);
    const remoteText = this.add.text(remoteBtnX + 36, toggleY + 6, 'REMOTE', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: isRemote ? '#00ff41' : '#006600',
    }).setOrigin(0.5, 0.5).setDepth(22);
    const remoteHit = this.add.rectangle(remoteBtnX + 36, toggleY + 6, 72, 16, 0, 0)
      .setDepth(22).setInteractive({ useHandCursor: true });
    remoteHit.on('pointerover', () => { drawRemote(true); });
    remoteHit.on('pointerout',  () => { drawRemote(false); });
    remoteHit.on('pointerdown', async () => {
      if (isRemote) return;
      await setProofServerMode('remote').catch(() => {});
      this._proofServerMode = 'remote';
      this._renderDropdown();
    });
    this._dropdownObjs.push(remoteGfx, remoteText, remoteHit);
  }

  _closeNetworkDropdown() {
    this._netDropdownOpen = false;
    if (this._dropdownObjs) {
      this._dropdownObjs.forEach(o => o.destroy());
      this._dropdownObjs = [];
    }
    if (this._outsideClickHandler) {
      this.input.off('pointerdown', this._outsideClickHandler);
      this._outsideClickHandler = null;
    }
    this._restoreNetBtnColor();
  }

  _restoreNetBtnColor() {
    if (!this._netStatusBtn) return;
    const s = this._lastNetStatus;
    if (!s) { this._netStatusBtn.setColor('#00aa22'); return; }
    const allOk = s.gameServer && s.proofServer && s.node && s.indexer;
    this._netStatusBtn.setColor(allOk ? '#00ff41' : '#ff8800');
  }

  _buildMuteButton(x, y) {
    const size = 28;
    const gfx = this.add.graphics().setDepth(10);
    const hit = this.add.rectangle(x + size / 2, y + size / 2, size, size, 0, 0)
      .setDepth(11).setInteractive({ useHandCursor: true });

    const draw = () => {
      const music = this.registry.get('themeMusic');
      const muted = !music || !music.isPlaying || music.volume === 0;
      gfx.clear();
      gfx.fillStyle(muted ? 0x440000 : 0x003300, 1);
      gfx.fillRect(x, y, size, size);
      gfx.lineStyle(1, muted ? 0xff4444 : 0x00ff41, 1);
      gfx.strokeRect(x, y, size, size);
      // Speaker body
      const cx = x + 8, cy = y + size / 2;
      gfx.fillStyle(muted ? 0xff4444 : 0x00ff41, 1);
      gfx.fillRect(cx, cy - 4, 4, 8);
      gfx.fillTriangle(cx, cy - 4, cx + 4, cy - 4, cx + 4, cy - 9);
      gfx.fillTriangle(cx, cy + 4, cx + 4, cy + 4, cx + 4, cy + 9);
      // Sound waves (or X if muted)
      if (!muted) {
        gfx.lineStyle(1, 0x00ff41, 1);
        gfx.strokeCircle(cx + 8, cy, 4);
        gfx.strokeCircle(cx + 8, cy, 7);
      } else {
        gfx.lineStyle(2, 0xff4444, 1);
        gfx.beginPath(); gfx.moveTo(cx + 7, cy - 4); gfx.lineTo(cx + 13, cy + 4); gfx.strokePath();
        gfx.beginPath(); gfx.moveTo(cx + 13, cy - 4); gfx.lineTo(cx + 7, cy + 4); gfx.strokePath();
      }
    };

    draw();

    hit.on('pointerover', () => { gfx.setAlpha(0.8); });
    hit.on('pointerout',  () => { gfx.setAlpha(1); });
    hit.on('pointerdown', () => {
      const music = this.registry.get('themeMusic');
      if (!music) return;
      if (music.isPlaying && music.volume > 0) {
        music.setVolume(0);
      } else {
        music.setVolume(0.5);
        if (!music.isPlaying) music.play();
      }
      draw();
    });
  }

  _isDisabled(i) {
    return i === 0 && !getAddress();
  }

  _move(dir) {
    let next = Phaser.Math.Wrap(this.selectedIndex + dir, 0, MENU_ITEMS.length);
    if (this._isDisabled(next)) next = Phaser.Math.Wrap(next + dir, 0, MENU_ITEMS.length);
    this.selectedIndex = next;
    this._updateSelection();
    if (this.sound) this.sound.menuSelect();
  }

  _updateSelection() {
    this.menuTexts.forEach((t, i) => {
      if (this._isDisabled(i)) {
        t.setColor('#003300');
        return;
      }
      t.setColor(i === this.selectedIndex ? '#00ff41' : '#00aa22');
    });
    const selected = this.menuTexts[this.selectedIndex];
    this.arrowText.setPosition(selected.x - selected.width / 2 - 16, selected.y);
  }

  _select() {
    if (!this.menuReady) return;
    if (this._isDisabled(this.selectedIndex)) return;
    if (this.sound) this.sound.click();

    switch (this.selectedIndex) {
      case 0: this._startMission(); break;
      case 1: this._showHighScores(); break;
      case 2: this._showAbout(); break;
    }
  }

  async _startMission() {
    const addr = getAddress();
    if (!addr) return;

    this.menuReady = false;
    this._showMessage('INITIATING MISSION...', '#00ff41');

    try {
      const { sessionId, characters, contractAddress, gameId } = await startSession();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene', { sessionId, walletAddress: addr, characters, contractAddress: contractAddress || null, gameId: gameId || null });
      });
    } catch (err) {
      const msg = err?.message || String(err);
      this._showMessage(`ERROR: ${msg.slice(0, 50)}`, '#ff4444', () => {
        this.menuReady = true;
      });
    }
  }

  async _connectWallet() {
    if (this._connecting) return;
    this._connecting = true;
    this.menuReady = false;

    if (this._walletBtn) {
      this._walletBtn.setText('CONNECTING...').setColor('#00aa22').removeInteractive();
    }

    const setStatus = (msg) => {
      if (this._walletBtn) this._walletBtn.setText(msg);
    };

    try {
      await connectLace(setStatus);

      // Rebuild top-right button showing address
      this._buildWalletButton();

      // Enable START MISSION
      const startBtn = this.menuTexts[0];
      startBtn.setColor('#00aa22');
      startBtn.setInteractive({ useHandCursor: true });
      startBtn.off('pointerover').on('pointerover', () => {
        this.selectedIndex = 0;
        this._updateSelection();
        if (this.sound) this.sound.menuSelect();
      });
      startBtn.off('pointerdown').on('pointerdown', () => this._select());
      this.selectedIndex = 0;
      this._updateSelection();
    } catch (e) {
      console.error('[connectWallet] error:', e);
      const msg = String(e.message || e).slice(0, 40);
      if (this._walletBtn) {
        this._walletBtn.setText('[ CONNECT WALLET ]').setColor('#ff4444');
        this._walletBtn.setInteractive({ useHandCursor: true });
      }
      this._showMessage(msg, '#ff4444', () => {});
    } finally {
      this.menuReady = true;
      this._connecting = false;
    }
  }

  async _showHighScores() {
    this.menuReady = false;
    this._closeOverlay();

    try {
      const { leaderboard } = await getScores();
      this._openOverlay('HIGH SCORES', (panel, startY) => {
        this.add.text(panel.x + 16, startY, 'RANK  AGENT          SCORE   Q   TIME', {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '6px',
          color: '#00aa22',
        });

        if (!leaderboard || leaderboard.length === 0) {
          this.add.text(panel.x + 16, startY + 24, 'NO SCORES YET', {
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: '#00aa22',
          });
        } else {
          leaderboard.slice(0, 10).forEach((entry, i) => {
            const a = entry.shielded_address || 'UNKNOWN';
            const truncAddr = a.length > 14 ? a.slice(0, 6) + '..' + a.slice(-6) : a;
            const mins = Math.floor((entry.time_elapsed || 0) / 60);
            const secs = String((entry.time_elapsed || 0) % 60).padStart(2, '0');
            const row = `#${String(i + 1).padStart(2, '0')}  ${truncAddr.padEnd(14)}  ${String(entry.score).padStart(5)}  ${String(entry.questions_used).padStart(2)}  ${mins}:${secs}`;
            this.add.text(panel.x + 16, startY + 20 + i * 22, row, {
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '6px',
              color: i === 0 ? '#00ff41' : '#00aa22',
            });
          });
        }
      });
    } catch (e) {
      this._openOverlay('HIGH SCORES', (panel, startY) => {
        this.add.text(panel.x + 16, startY, 'FAILED TO LOAD SCORES', {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '7px',
          color: '#ff4444',
        });
      });
    }
  }

  _showAbout() {
    this.menuReady = false;
    this._closeOverlay();
    this._openOverlay('ABOUT', (panel, startY) => {
      const lines = [
        'PROOF OF SPY',
        '',
        'IDENTIFY THE HIDDEN SPY AMONG',
        '16 MILITARY OPERATIVES USING',
        'ZERO-KNOWLEDGE PROOFS.',
        '',
        'QUESTION VERIFICATION:',
        'SIMULATED ON-DEVICE. ANSWERS ARE',
        'CHECKED LOCALLY AND LOGGED TO',
        'THE SECURE CHANNEL FOR GAMEPLAY.',
        '',
        'FINAL DECLARATION:',
        'YOUR GUESS IS VERIFIED ON-CHAIN',
        'VIA A MIDNIGHT ZERO-KNOWLEDGE',
        'PROOF — WITHOUT REVEALING THE',
        'SPY IDENTITY UNTIL YOU DECLARE.',
        '',
        'CONTROLS:',
        'CLICK CATEGORY BUTTONS TO ASK',
        'CLICK CARDS TO ELIMINATE',
        'DECLARE SPY WHEN CERTAIN',
        '',
        'POWERED BY MIDNIGHT NETWORK',
      ];
      lines.forEach((line, i) => {
        this.add.text(panel.x + 16, startY + i * 22, line, {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '9px',
          color: line === 'PROOF OF SPY' || line === 'CONTROLS:' || line === 'QUESTION VERIFICATION:' || line === 'FINAL DECLARATION:' ? '#00ff41' : '#00aa22',
        });
      });
    });
  }

  _abort() {
    if (this.sound) this.sound.accessDenied();
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.DANGER, 0.2);
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'ACCESS DENIED', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '28px',
      color: '#ff0000',
    }).setOrigin(0.5);
    this.time.delayedCall(800, () => { flash.destroy(); msg.destroy(); });
  }

  _showMessage(text, color = '#00ff41', onClose = null) {
    this._closeOverlay();
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 80, text, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color,
      align: 'center',
    }).setOrigin(0.5);
    if (onClose) {
      this.time.delayedCall(2000, () => { msg.destroy(); onClose(); });
    }
    this._tempMsg = msg;
  }

  _openOverlay(title, buildContent) {
    this._closeOverlay();
    this._closeNetworkDropdown();
    this.menuReady = false;

    const pw = 700, ph = 400;
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;

    // Use a container so everything is destroyed together
    const container = this.add.container(0, 0);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.PANEL_BG, 0.97);
    bg.fillRect(px, py, pw, ph);
    bg.lineStyle(2, COLORS.BORDER, 1);
    bg.strokeRect(px, py, pw, ph);
    bg.lineStyle(1, COLORS.DIM, 1);
    const s = 10;
    [[px, py], [px+pw, py], [px, py+ph], [px+pw, py+ph]].forEach(([cx, cy], i) => {
      const dx = i % 2 === 0 ? s : -s;
      const dy = i < 2 ? s : -s;
      bg.beginPath(); bg.moveTo(cx+dx, cy); bg.lineTo(cx, cy); bg.lineTo(cx, cy+dy); bg.strokePath();
    });
    container.add(bg);

    const titleText = this.add.text(px + pw / 2, py + 16, `[ ${title} ]`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '10px',
      color: '#00ff41',
    }).setOrigin(0.5, 0);
    container.add(titleText);

    // Proxy add.text so content objects go into the container
    const origAddText = this.add.text.bind(this.add);
    this.add.text = (...args) => {
      const t = origAddText(...args);
      container.add(t);
      return t;
    };
    buildContent({ x: px, y: py, w: pw, h: ph }, py + 46);
    this.add.text = origAddText;

    const closeBtn = this.add.text(px + pw - 16, py + 12, 'X', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00aa22',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    container.add(closeBtn);
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff4444'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#00aa22'));
    closeBtn.on('pointerdown', () => { this._closeOverlay(); this.menuReady = true; });

    this.overlay = { container };
  }

  shutdown() {
    if (this._cursorStyle) {
      this._cursorStyle.remove();
      this._cursorStyle = null;
    }
  }

  _closeOverlay() {
    if (this.overlay) {
      this.overlay.container.destroy(true);
      this.overlay = null;
    }
    if (this._tempMsg) {
      this._tempMsg.destroy();
      this._tempMsg = null;
    }
    this.menuReady = true;
  }
}
