const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client;
let isReady = false;

function initializeWhatsApp() {
    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        }
    });

    client.on('qr', (qr) => {
        console.log('[WhatsApp] Scan this QR code to authenticate:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('[WhatsApp] Client is ready!');
        isReady = true;
    });

    client.on('authenticated', () => {
        console.log('[WhatsApp] Authenticated successfully!');
    });

    client.on('auth_failure', msg => {
        console.error('[WhatsApp] Authentication failure:', msg);
    });

    client.initialize();
}

async function sendWhatsAppMessage(number, message) {
    if (!client || !isReady) {
        console.warn('[WhatsApp] Client not ready. Cannot send message to:', number);
        return false;
    }

    try {
        // WhatsApp expects numbers in format: countrycode+number@c.us (e.g. 919876543210@c.us)
        const sanitizedNumber = String(number).replace(/\D/g, '');
        // Default to India prefix if missing
        const formattedNumber = sanitizedNumber.length === 10 ? `91${sanitizedNumber}` : sanitizedNumber;
        const chatId = `${formattedNumber}@c.us`;

        await client.sendMessage(chatId, message);
        console.log(`[WhatsApp] Message sent successfully to ${formattedNumber}`);
        return true;
    } catch (err) {
        console.error(`[WhatsApp] Failed to send message to ${number}:`, err);
        return false;
    }
}

module.exports = {
    initializeWhatsApp,
    sendWhatsAppMessage
};
