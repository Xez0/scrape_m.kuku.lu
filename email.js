// ============================================================================
// SYSTEM     : EMAIL MANAGER (LIGHTWEIGHT)
// AUTHOR     : Xez
// MODULE     : CLI Interactive Controller
// LAUNCH     : node email.js
// DEPENDENCY : node-fetch, cheerio
// ============================================================================

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const cheerio = require('cheerio');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// --- [ CONFIGURATION & CONSTANTS ] ---
const BASE_URL = 'https://m.kuku.lu';
const COOKIES_FILE = path.join(__dirname, 'cookies-lite.json');
const EMAILS_FILE = path.join(__dirname, 'my-emails.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// --- [ CACHE & DYNAMIC REGISTRIES ] ---
let cachedCsrfToken = null;
let cachedCsrfSubtoken = null;
let DYNAMIC_DOMAINS = [];

// --- [ ANSI TERMINAL THEME ENGINE ] ---
const Theme = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    bgGray: '\x1b[100m'
};

// --- [ UI INTERFACE HELPERS ] ---
const UI = {
    line: (char = '─', len = 65) => Theme.dim + char.repeat(len) + Theme.reset,
    success: (msg) => console.log(` ${Theme.green}✔${Theme.reset} ${msg}`),
    error: (msg) => console.log(` ${Theme.red}✘${Theme.reset} ${Theme.bold}${msg}${Theme.reset}`),
    info: (msg) => console.log(` ${Theme.cyan}ℹ${Theme.reset} ${msg}`),
    warn: (msg) => console.log(` ${Theme.yellow}⚠${Theme.reset} ${msg}`)
};

// ============================================================================
// 1. LOCAL DATABASE CONTROLLER (JSON MANAGEMENT)
// ============================================================================

/** Loads saved emails from the local JSON registry file */
function loadSavedEmails() {
    if (fs.existsSync(EMAILS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf8'));
        } catch { return []; }
    }
    return [];
}

/** Commits a newly generated email address to the local registry */
function saveEmailToFile(email, type = 'manual', expiry = null) {
    const list = loadSavedEmails();
    if (list.some(e => e.email === email)) return;
    
    list.push({
        email,
        type,         
        expiry,       
        createdAt: new Date().toISOString()
    });
    fs.writeFileSync(EMAILS_FILE, JSON.stringify(list, null, 2));
}

/** Purges a single email record from the local registry database */
function removeSavedEmail(email) {
    const list = loadSavedEmails().filter(e => e.email !== email);
    fs.writeFileSync(EMAILS_FILE, JSON.stringify(list, null, 2));
}

// ============================================================================
// 2. NETWORK CONTROLLER (COOKIE JAR & HTTP AGENT)
// ============================================================================

class CookieJar {
    constructor() { this.cookies = {}; }

    /** Intercepts and parses Set-Cookie tokens from HTTP response headers */
    capture(response) {
        const raw = response.headers.raw?.()?.['set-cookie'] || [];
        for (const entry of raw) {
            const main = entry.split(';')[0];
            const eqIdx = main.indexOf('=');
            if (eqIdx === -1) continue;
            const name = main.substring(0, eqIdx).trim();
            const value = main.substring(eqIdx + 1).trim();
            if (name) this.cookies[name] = value;
        }
    }

    /** Serializes all stored cookies into a valid request header format */
    header() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    /** Saves current cookie state to the disk file */
    save() { fs.writeFileSync(COOKIES_FILE, JSON.stringify(this.cookies, null, 2)); }

    /** Restores cookies state from the disk file */
    load() {
        if (fs.existsSync(COOKIES_FILE)) {
            try {
                this.cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
                return Object.keys(this.cookies).length > 0;
            } catch { return false; }
        }
        return false;
    }
}

const jar = new CookieJar();

/** Abstracted HTTP Client wrapper handling automatic proxy redirections and cookies routing */
async function http(urlPath, options = {}) {
    const url = urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
    const headers = { 'User-Agent': USER_AGENT, 'Cookie': jar.header(), ...options.headers };
    const res = await fetch(url, { ...options, headers, redirect: 'manual' });

    jar.capture(res);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (loc) return http(loc, { ...options, method: 'GET', body: undefined });
    }
    return res;
}

// --- [ READLINE INTERACTION AGENT ] ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// ============================================================================
// 3. CORE SERVICE API (SCRAPER & BUSINESS LOGIC)
// ============================================================================

/** Pulls secure main CSRF Validation token from the remote node entry point (with cache support) */
async function getCsrfToken(forceRefresh = false) {
    if (!cachedCsrfToken || forceRefresh) {
        const res = await http('/id.php');
        const html = await res.text();
        const match = html.match(/csrf_token_check=([a-f0-9]+)/);
        if (!match) throw new Error('Gagal mengambil CSRF token');
        
        cachedCsrfToken = match[1];
        
        const subMatch = html.match(/csrf_subtoken_check=([a-f0-9]+)/);
        if (subMatch) {
            cachedCsrfSubtoken = subMatch[1];
        }

        // Dynamically scrape domain options from the HTML
        const $ = cheerio.load(html);
        const domains = [];
        $('input[name="input_manualmaildomain"]').each((_, el) => {
            const val = $(el).val();
            if (val && val.includes('.')) {
                domains.push(val);
            }
        });
        if (domains.length > 0) {
            DYNAMIC_DOMAINS = [...new Set(domains)].sort();
        }
        
        return { token: cachedCsrfToken, html };
    }
    return { token: cachedCsrfToken, html: null };
}

/** Resolves second tier sub-validation token specifically for transient addresses */
async function getCsrfSubtoken(html) {
    if (cachedCsrfSubtoken) return cachedCsrfSubtoken;
    let text = html;
    if (!text) {
        const res = await getCsrfToken(true);
        text = res.html;
    }
    const match = text ? text.match(/csrf_subtoken_check=([a-f0-9]+)/) : null;
    if (match) {
        cachedCsrfSubtoken = match[1];
    }
    return cachedCsrfSubtoken || '';
}

/** Issues a network command to bind a persistent manual or custom email allocation */
async function addManualEmail(customUser = '', domain = 'nekosan.uk', isRetry = false) {
    const { token } = await getCsrfToken();
    const url = `/index.php?action=addMailAddrByManual&nopost=1&by_system=1&t=${Math.floor(Date.now() / 1000)}&csrf_token_check=${token}&newdomain=${domain}&newuser=${encodeURIComponent(customUser)}&recaptcha_token=&_=${Date.now()}`;
    const res = await http(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const text = await res.text();
    if (text.startsWith('OK:')) {
        const email = text.substring(3).split(',')[0];
        return { success: true, email };
    }
    if ((text.includes('csrf') || text.includes('session') || text.includes('expired')) && !isRetry) {
        await getCsrfToken(true);
        return addManualEmail(customUser, domain, true);
    }
    return { success: false, error: text };
}

/** Issues a network command to trigger an ephemeral time-locked mailbox creation */
async function addOnetimeEmail(isRetry = false) {
    const { token, html } = await getCsrfToken();
    const subtoken = await getCsrfSubtoken(html);
    const url = `/index.php?action=addMailAddrByOnetime&nopost=1&by_system=1&csrf_token_check=${token}&csrf_subtoken_check=${subtoken}&recaptcha_token=&_=${Date.now()}`;
    const res = await http(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const text = await res.text();
    if (text.startsWith('OK:')) {
        const parts = text.substring(3).split(',');
        return { success: true, email: parts[0], expiry: parts[2] || 'Tidak diketahui' };
    }
    if ((text.includes('csrf') || text.includes('session') || text.includes('expired')) && !isRetry) {
        await getCsrfToken(true);
        return addOnetimeEmail(true);
    }
    return { success: false, error: text };
}

/** Disconnects and releases allocation hooks of an address block on the server side */
async function deleteEmailFromServer(emailAddr, isRetry = false) {
    const { token } = await getCsrfToken();
    const url = `/index._addrlist.php?action=delAddrList&nopost=1&csrf_token_check=${token}&num_list=${encodeURIComponent(emailAddr + ',')}&_=${Date.now()}`;
    const res = await http(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const text = await res.text();
    if (text.trim().startsWith('OK') || text.trim() === '') return { success: true };
    if ((text.includes('csrf') || text.includes('session') || text.includes('expired')) && !isRetry) {
        await getCsrfToken(true);
        return deleteEmailFromServer(emailAddr, true);
    }
    return { success: false, error: text };
}

/** Pulls and filters locally saved entries, matching fresh logs forward */
function listMyEmails() {
    const saved = loadSavedEmails();
    saved.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return saved;
}

/** Fetches recent inbox matrix structures, indexing IDs, keys, metadata and text chunks */
async function viewInbox(email, isRetry = false) {
    const { token } = await getCsrfToken();
    const url = `/recv._ajax.php?q=${encodeURIComponent(email)}&nopost=1&csrf_token_check=${token}&_=${Date.now()}`;
    const res = await http(url, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${BASE_URL}/recv.php` }
    });
    const html = await res.text();

    if ((html.includes('csrf') || html.includes('session') || html.includes('expired')) && !isRetry) {
        await getCsrfToken(true);
        return viewInbox(email, true);
    }

    const $ = cheerio.load(html);
    const results = [];

    const mailList = [];
    const scriptRegex = /openMailData\(\s*['"](\d+)['"]\s*,\s*['"]([a-f0-9]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        const mailId = match[1];
        const key = match[2];
        const metaStr = match[3];

        let from = '';
        if (metaStr) {
            const meta = {};
            metaStr.split(';').forEach(pair => {
                const eqIdx = pair.indexOf('=');
                if (eqIdx !== -1) {
                    meta[pair.substring(0, eqIdx).trim()] = decodeURIComponent(pair.substring(eqIdx + 1).trim());
                }
            });
            if (meta.from) {
                from = meta.from;
            }
        }
        mailList.push({ mailId, key, from });
    }

    for (const item of mailList) {
        const mailId = item.mailId;
        const key = item.key;
        let from = item.from;
        let subject = '(tanpa subjek)';
        let time = '';

        const $mailArea = $(`#area_mail_${mailId}`);
        if ($mailArea.length) {
            const titleBold = $mailArea.find(`#area_mail_title_${mailId} b`);
            if (titleBold.length) subject = titleBold.text().trim();

            const gray = $mailArea.find('.font_gray');
            if (gray.length) {
                gray.find('script').remove();
                const rawText = gray.text().replace(/\s+/g, ' ').trim();
                const parts = rawText.split('|');
                if (parts.length >= 2) {
                    time = parts[0].trim().replace(/\s*\([^)]*\)/, '');
                    if (!from) {
                        from = parts[1].split('»')[0].trim();
                    }
                } else {
                    time = rawText;
                }
            }
        }
        results.push({ num: parseInt(mailId), key, subject, time, from });
    }
    results.sort((a, b) => b.num - a.num);
    return results;
}

/** Requests body string structures, cleaning up noise, tracking margins and text-wrap breaks */
async function readEmailContent(num, key, isRetry = false) {
    const { token } = await getCsrfToken();
    const body = new URLSearchParams({ num: String(num), key, nopost: '1', csrf_token_check: token });
    const res = await http('/smphone.app.recv.view.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const html = await res.text();

    if ((html.includes('csrf') || html.includes('session') || html.includes('expired')) && !isRetry) {
        await getCsrfToken(true);
        return readEmailContent(num, key, true);
    }

    const $ = cheerio.load(html);
    
    // Remove unwanted script, style, iframe, noscript elements
    $('script, style, iframe, noscript').remove();
    
    // Remove navigation buttons and menu links (Balas, Hapus, Tutup, dsb.)
    $('a, button, input[type="button"]').each(function() {
        const txt = $(this).text().trim().toLowerCase();
        if (
            txt.includes('tutup') || txt.includes('close') || 
            txt.includes('balas') || txt.includes('reply') || 
            txt.includes('hapus') || txt.includes('delete') || 
            txt.includes('teruskan') || txt.includes('forward')
        ) {
            $(this).remove();
        }
    });

    // Remove the duplicate first table (metadata header From/Subject/Time) at the top of the email body
    $('table').first().each(function() {
        const text = $(this).text().toLowerCase();
        if (text.includes('from') || text.includes('dari') || text.includes('subject') || text.includes('subjek')) {
            $(this).remove();
        }
    });

    // Replace break tags with newline characters
    $('br').replaceWith('\n');
    
    // Append newline after block elements to prevent nested container spacing build-ups
    $('p, div, tr, li, h1, h2, h3, td, th').each(function() {
        const $el = $(this);
        if ($el.text().trim()) {
            $el.after('\n');
        }
    });

    let text = $('body').text() || $.text();
    
    // Normalize lines, trim them, and collapse consecutive empty lines to a single empty line
    let lines = text.split('\n').map(line => line.trim());
    let cleanLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '') {
            if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1] !== '') {
                cleanLines.push('');
            }
        } else {
            cleanLines.push(lines[i]);
        }
    }
    
    let content = cleanLines.join('\n').trim();

    // Highlight OTP & verification codes: matches standalone 4 to 8 digit numbers
    content = content.replace(/\b(\d{4,8})\b/g, `${Theme.bold}${Theme.green}$1${Theme.reset}`);

    return content;
}

// ============================================================================
// 4. MAIN APP PIPELINE & MENU LOOP CONSOLE INTERACTION
// ============================================================================

(async () => {
    console.clear();
    
    // --- [ CUSTOM APP BANNERS WITH WATERMARK XEZ ] ---
    console.log(`\n ${Theme.cyan}${Theme.bold}┌────────────────────────────────────────┐${Theme.reset}`);
    console.log(` ${Theme.cyan}${Theme.bold}│      EMAIL MANAGER (LIGHTWEIGHT)       │${Theme.reset}`);
    console.log(` ${Theme.cyan}${Theme.bold}│             Project by Xez             │${Theme.reset}`);
    console.log(` ${Theme.cyan}${Theme.bold}└────────────────────────────────────────┘${Theme.reset}`);

    if (jar.load()) UI.success(`Database Cookies synced with environment initialization.`);

    console.log(` ${Theme.dim}Connecting to network infrastructure...${Theme.reset}`);
    try {
        await getCsrfToken(true);
        jar.save();
        UI.success('Secure channel route successfully established.\n');
    } catch (err) {
        UI.error(`Handshake connection aborted: ${err.message}`);
        rl.close();
        process.exit(1);
    }

    let cachedEmails = [];
    function refreshEmailList() {
        cachedEmails = listMyEmails();
        if (cachedEmails.length > 0) {
            UI.info(`Active database: ${Theme.bold}${cachedEmails.length}${Theme.reset} pool account keys tracked.`);
        } else {
            UI.warn('Database currently holds zero mail tracking metrics.');
        }
        return cachedEmails;
    }

    refreshEmailList();

    const menu = `
 ${Theme.cyan}${Theme.bold}┌───────────────── Xez Control Panel ──────────────────┐${Theme.reset}
   ${Theme.bold}${Theme.green}1.${Theme.reset} Generate Random Mail    ${Theme.dim}(Infinite Lifecycle)${Theme.reset}
   ${Theme.bold}${Theme.green}2.${Theme.reset} Custom Mail Address     ${Theme.dim}(Selectable Domain)${Theme.reset}
   ${Theme.bold}${Theme.green}3.${Theme.reset} Create Temporary Mail   ${Theme.dim}(With Expiration)${Theme.reset}
   ${Theme.bold}${Theme.green}4.${Theme.reset} Database Safe Locker    ${Theme.dim}(View & Delete Vault)${Theme.reset}
   ${Theme.bold}${Theme.green}5.${Theme.reset} Check Central Inbox    ${Theme.dim}(Read Incoming Letters)${Theme.reset}
   
   ${Theme.bold}${Theme.red}0. System Shutdown${Theme.reset}
 ${Theme.cyan}${Theme.bold}└──────────────────────────────────────────────────────┘${Theme.reset}`;

    let running = true;
    while (running) {
        console.log(menu);
        const pilihan = (await ask(`\n ${Theme.bold}${Theme.cyan}❯ Select Command Number:${Theme.reset} `)).trim();
        
        if (pilihan === '') {
            console.clear();
            continue;
        }

        console.log(`\n${UI.line()}`);
        let needsPause = true;

        switch (pilihan) {
            case '1': {
                console.log(` ${Theme.dim}Requesting token distribution array...${Theme.reset}`);
                const result = await addManualEmail();
                if (result.success) {
                    UI.success(`Mail allocation confirmed!`);
                    console.log(`   └─ Address: ${Theme.bold}${Theme.cyan}${result.email}${Theme.reset}`);
                    saveEmailToFile(result.email, 'manual');
                    console.log();
                    refreshEmailList();
                } else {
                    UI.error(`Allocation mapping declined: ${result.error}`);
                }
                break;
            }
            case '2': {
                const customName = (await ask(` ${Theme.cyan}❯ Target Handle Name (e.g. shadow_blade):${Theme.reset} `)).trim();
                if (!customName) {
                    UI.warn('Operation terminated: Invalid empty name string value.');
                    needsPause = false;
                    break;
                }
                
                // Use dynamically resolved domains, fallback to initial domains if empty
                const domains = DYNAMIC_DOMAINS.length > 0 ? DYNAMIC_DOMAINS : [
                    'nekosan.uk', 'mbox.re', 'f5.si', 'tapi.re', 'instaddr.win',
                    'instaddr.me', 'instaddr.ch', 'altmails.com', 'boxfi.uk', 'haren.uk',
                    'bangban.uk', 'catgroup.uk', 'goatmail.uk', 'sendnow.win', 'ccmail.uk',
                    'exdonuts.com', 'hamham.uk', 'digdig.org', 'owleyes.ch', 'stayhome.li',
                    'fanclub.pm', 'simaenaga.com', 'mirai.re', 'moimoi.re', 'quicksend.ch',
                    'instaddr.uk', 'meruado.uk', 'instmail.uk', 'sendapp.uk', 'send4.uk',
                    'mail4.uk', 'addrin.uk', 'nanana.uk', 'adadad.uk', 'otona.uk',
                    'fuwa.li', 'kpost.be', 'fuwa.be', 'usako.net', 'eay.jp',
                    'via.tokyo.jp', 'ichigo.me', 'choco.la', 'cream.pink', 'merry.pink',
                    'neko2.net', 'fuwamofu.com', 'macr2.com', 'svk.jp'
                ].sort();

                // Dynamically calculate padding based on maximum domain length
                const maxDomainLen = Math.max(...domains.map(d => d.length), 15) + 3;

                console.log(`\n ${Theme.bold}┌──────────────── Matrix Gateway Protocols ────────────────┐${Theme.reset}`);
                const rows = Math.ceil(domains.length / 3);
                for (let i = 0; i < rows; i++) {
                    let rowStr = '  ';
                    for (let col = 0; col < 3; col++) {
                        const idx = i + col * rows;
                        if (idx < domains.length) {
                            const num = String(idx + 1).padStart(2, '0');
                            const domain = domains[idx].padEnd(maxDomainLen, ' ');
                            rowStr += `${Theme.green}${num}${Theme.reset}. ${Theme.dim}${domain}${Theme.reset} `;
                        }
                    }
                    console.log(rowStr);
                }
                console.log(` ${Theme.bold}└──────────────────────────────────────────────────────────┘${Theme.reset}`);
                
                const domainChoice = (await ask(`\n ${Theme.cyan}❯ Route Index key (1-${domains.length}) [Enter for default]:${Theme.reset} `)).trim();
                let selectedDomain = 'nekosan.uk';
                if (domainChoice) {
                    const dIdx = parseInt(domainChoice) - 1;
                    if (dIdx >= 0 && dIdx < domains.length) {
                        selectedDomain = domains[dIdx];
                    } else {
                        UI.warn('Index out of limits. Reverting fallback to (nekosan.uk).');
                    }
                }

                console.log(` ${Theme.dim}Injecting custom account registry structure...${Theme.reset}`);
                const result = await addManualEmail(customName, selectedDomain);
                if (result.success) {
                    UI.success(`Custom routing bound!`);
                    console.log(`   └─ Address: ${Theme.bold}${Theme.cyan}${result.email}${Theme.reset}`);
                    saveEmailToFile(result.email, 'custom');
                    console.log();
                    refreshEmailList();
                } else {
                    UI.error(`Injection failed: ${result.error}`);
                }
                break;
            }
            case '3': {
                console.log(` ${Theme.dim}Requesting time-lock transient validation session...${Theme.reset}`);
                const result = await addOnetimeEmail();
                if (result.success) {
                    UI.success(`Transient Session locked!`);
                    console.log(`   ├─ Address: ${Theme.bold}${Theme.cyan}${result.email}${Theme.reset}`);
                    console.log(`   └─ Destruction sequence: ${Theme.bold}${Theme.yellow}${result.expiry}${Theme.reset}`);
                    saveEmailToFile(result.email, 'onetime', result.expiry);
                    console.log();
                    refreshEmailList();
                } else {
                    UI.error(`Transient Request Rejected: ${result.error}`);
                }
                break;
            }
            case '4': {
                refreshEmailList();
                if (cachedEmails.length === 0) {
                    UI.warn('No active record pointers locked inside system files.');
                    break;
                }
                console.log(`\n ${Theme.bold}┌────────────── Storage Mailbox Registry ──────────────┐${Theme.reset}`);
                cachedEmails.forEach((e, i) => {
                    const typeLabel = e.type === 'onetime' ? ` [${Theme.yellow}⏰ Ephemeral${Theme.reset}]` : ` [${Theme.green}⚡ Stable${Theme.reset}]`;
                    const expiryLabel = e.expiry ? ` (${Theme.dim}exp: ${e.expiry}${Theme.reset})` : '';
                    const idxStr = String(i + 1).padStart(2, '0');
                    console.log(`   ${Theme.bold}${Theme.cyan}${idxStr}${Theme.reset}. ${e.email.padEnd(30, ' ')}${typeLabel}${expiryLabel}`);
                });
                console.log(` ${Theme.bold}└──────────────────────────────────────────────────────┘${Theme.reset}`);
                
                const hapus = (await ask(`\n ${Theme.cyan}❯ Index target record to purge (or Enter to go back):${Theme.reset} `)).trim();
                if (hapus) {
                    const hIdx = parseInt(hapus) - 1;
                    if (hIdx >= 0 && hIdx < cachedEmails.length) {
                        const target = cachedEmails[hIdx];
                        const konfirmasi = (await ask(` ${Theme.red}${Theme.bold}⚠ Destructive confirmation: Wipe ${target.email} from cloud? (y/n):${Theme.reset} `)).trim().toLowerCase();
                        if (konfirmasi !== 'y') {
                            UI.info('Wipe routine halted by user override switch.');
                            needsPause = false;
                            break;
                        }
                        console.log(` ${Theme.dim}Broadcasting detachment packet commands...${Theme.reset}`);
                        const delResult = await deleteEmailFromServer(target.email);
                        if (delResult.success) {
                            UI.success(`Remote allocation link terminated.`);
                            removeSavedEmail(target.email);
                            refreshEmailList();
                        } else {
                            UI.error(`Cloud configuration synchronization failed: ${delResult.error}`);
                            const hapusLokal = (await ask(`\n ${Theme.yellow}❯ Purge local registry database profile only? (y/n):${Theme.reset} `)).trim().toLowerCase();
                            if (hapusLokal === 'y') {
                                removeSavedEmail(target.email);
                                UI.success('Local pointer context wiped.');
                                refreshEmailList();
                            }
                        }
                    } else {
                        UI.error('Index target does not resolve.');
                    }
                } else {
                    needsPause = false;
                }
                break;
            }
            case '5': {
                refreshEmailList();
                if (cachedEmails.length === 0) {
                    UI.warn('Execution terminated: Empty tracking pool.');
                    break;
                }

                console.log(`\n ${Theme.bold}┌────────────── Target Selection Array ──────────────┐${Theme.reset}`);
                cachedEmails.forEach((e, i) => {
                    console.log(`   ${Theme.bold}${Theme.cyan}${String(i + 1).padStart(2, '0')}${Theme.reset}. ${e.email}`);
                });
                console.log(` ${Theme.bold}└────────────────────────────────────────────────────┘${Theme.reset}`);
                
                const emailChoice = (await ask(`\n ${Theme.cyan}❯ Select target tracking index number:${Theme.reset} `)).trim();
                if (!emailChoice) {
                    needsPause = false;
                    break;
                }
                const emailIdx = parseInt(emailChoice) - 1;
                if (emailIdx < 0 || emailIdx >= cachedEmails.length) {
                    UI.error('Mismatch reference bounds mapping.');
                    break;
                }
                const emailAddr = cachedEmails[emailIdx].email;

                console.log(` ${Theme.dim}Fetching feed streams channel for ${emailAddr}...${Theme.reset}`);
                const emails = await viewInbox(emailAddr);
                if (emails.length === 0) {
                    UI.warn('Feed index contains zero active elements.');
                    break;
                }
                
                console.log(`\n ${Theme.bold}${Theme.green}┌──────────────────────────────────────── Inbox Stream ────────────────────────────────────────┐${Theme.reset}`);
                emails.forEach((e, i) => {
                    const idxStr = String(i + 1).padStart(2, '0');
                    const senderStr = e.from.substring(0, 25).padEnd(25, ' ');
                    const subjectStr = e.subject.substring(0, 35).padEnd(35, ' ');
                    console.log(`   ${Theme.bold}${Theme.green}[${idxStr}]${Theme.reset} ${Theme.dim}${e.time}${Theme.reset} | ${Theme.cyan}From:${Theme.reset} ${senderStr} | ${Theme.bold}Subj:${Theme.reset} ${subjectStr}`);
                });
                console.log(` ${Theme.bold}${Theme.green}└──────────────────────────────────────────────────────────────────────────────────────────────┘${Theme.reset}`);
                
                const pilihanEmail = (await ask(`\n ${Theme.cyan}❯ Select Letter Index to parse (or press Enter to close):${Theme.reset} `)).trim();
                if (!pilihanEmail) {
                    needsPause = false;
                    break;
                }
                const idx = parseInt(pilihanEmail) - 1;
                if (idx < 0 || idx >= emails.length) {
                    UI.error('Index map parsing out of range.');
                    break;
                }
                const selected = emails[idx];
                console.log(`\n ${Theme.dim}Unpacking encryption body context...${Theme.reset}`);
                const content = await readEmailContent(selected.num, selected.key);
                
                console.clear();
                console.log(`\n${Theme.bgGray}${Theme.bold}  XEZ - SECURE PORTABLE VIEWER LOG  ${Theme.reset}`);
                console.log(` ${Theme.bold}${Theme.cyan}From${Theme.reset}    : ${selected.from}`);
                console.log(` ${Theme.bold}${Theme.cyan}Subject${Theme.reset} : ${Theme.bold}${selected.subject}${Theme.reset}`);
                console.log(` ${Theme.bold}${Theme.cyan}Time${Theme.reset}    : ${selected.time}`);
                console.log(UI.line('═', 75));
                console.log(`\n${content}\n`);
                console.log(UI.line('═', 75));
                break;
            }
            case '0':
                running = false;
                console.log(`\n ${Theme.yellow}🔌 Initializing graceful system shutdown procedures...${Theme.reset}`);
                break;
            default:
                UI.error('Command array mismatch: Token unmapped.');
        }

        if (running) {
            jar.save();
            if (needsPause) {
                await ask(`\n ${Theme.dim}Press [Enter] to return to Control Panel...${Theme.reset}`);
            }
            console.clear();
        }
    }

    rl.close();
    console.log(` ${Theme.green}${Theme.bold}✔ Core closed safely. Context memory cleared.${Theme.reset}\n`);
})();