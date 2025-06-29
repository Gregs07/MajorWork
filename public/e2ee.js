// E2EE helper using Web Crypto API - for browser

const STORAGE_KEYS = {
  priv: 'e2ee_privateKey',
  pub: 'e2ee_publicKey',
};

async function generateKeyPair() {
  const pair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );
  await saveKeyPair(pair);
  return pair;
}

async function saveKeyPair({publicKey, privateKey}) {
  const pub = await exportPublicKey(publicKey);
  const priv = await exportPrivateKey(privateKey);
  localStorage.setItem(STORAGE_KEYS.pub, pub);
  localStorage.setItem(STORAGE_KEYS.priv, priv);
}

async function loadKeyPair() {
  const pub = localStorage.getItem(STORAGE_KEYS.pub);
  const priv = localStorage.getItem(STORAGE_KEYS.priv);
  if (pub && priv) {
    return {
      publicKey: await importPublicKey(pub),
      privateKey: await importPrivateKey(priv),
    };
  }
  return null;
}

async function exportPublicKey(key) {
  const spki = await window.crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(spki)));
}
async function importPublicKey(spkiB64) {
  const binary = Uint8Array.from(atob(spkiB64), x => x.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    "spki", binary.buffer, {name: "RSA-OAEP", hash: "SHA-256"}, true, ["encrypt"]
  );
}
async function exportPrivateKey(key) {
  const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", key);
  return btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
}
async function importPrivateKey(pkcs8B64) {
  const binary = Uint8Array.from(atob(pkcs8B64), x => x.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    "pkcs8", binary.buffer, {name: "RSA-OAEP", hash: "SHA-256"}, true, ["decrypt"]
  );
}

async function encryptMessage(publicKey, message) {
  const enc = new TextEncoder().encode(message);
  const encrypted = await window.crypto.subtle.encrypt({name: "RSA-OAEP"}, publicKey, enc);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}
async function decryptMessage(privateKey, encryptedB64) {
  const encrypted = Uint8Array.from(atob(encryptedB64), x => x.charCodeAt(0));
  const decrypted = await window.crypto.subtle.decrypt({name: "RSA-OAEP"}, privateKey, encrypted);
  return new TextDecoder().decode(decrypted);
}

// --- Hybrid E2EE: AES for body, RSA for keys ---

async function generateAESKey() {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function exportAESKey(key) {
  const raw = await window.crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}
async function importAESKey(rawB64) {
  const raw = Uint8Array.from(atob(rawB64), x => x.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    "raw", raw.buffer, "AES-GCM", true, ["encrypt", "decrypt"]
  );
}

async function aesEncrypt(aesKey, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const enc = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, aesKey, data
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(enc)))
  };
}

async function aesDecrypt(aesKey, ivB64, ciphertextB64) {
  const iv = Uint8Array.from(atob(ivB64), x => x.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextB64), x => x.charCodeAt(0));
  const dec = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv }, aesKey, ciphertext
  );
  return new TextDecoder().decode(dec);
}

// Encrypt message so both sender and recipient can read
async function encryptForBoth(myPublicKey, recipientPublicKey, plaintext) {
  // 1. Generate AES key
  const aesKey = await generateAESKey();
  // 2. Encrypt plaintext with AES
  const { iv, ciphertext } = await aesEncrypt(aesKey, plaintext);
  // 3. Export AES key
  const rawAES = await exportAESKey(aesKey);
  // 4. Encrypt AES key for both users
  const encAESforSender = await encryptMessage(myPublicKey, rawAES);
  const encAESforRecipient = await encryptMessage(recipientPublicKey, rawAES);

  return {
    ciphertext,
    iv,
    keyForSender: encAESforSender,
    keyForRecipient: encAESforRecipient
  };
}

// Decrypt message for either sender or recipient (you have privateKey, know if you are sender)
async function decryptForMyself(privateKey, encrypted, isSender) {
  const whichKey = isSender ? encrypted.keyForSender : encrypted.keyForRecipient;
  // 1. Decrypt AES key
  const rawAES = await decryptMessage(privateKey, whichKey);
  const aesKey = await importAESKey(rawAES);
  // 2. Decrypt message
  return await aesDecrypt(aesKey, encrypted.iv, encrypted.ciphertext);
}

window.E2EE = {
  generateKeyPair,
  loadKeyPair,
  saveKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  encryptMessage,
  decryptMessage,
  generateAESKey,
  exportAESKey,
  importAESKey,
  aesEncrypt,
  aesDecrypt,
  encryptForBoth,
  decryptForMyself
};