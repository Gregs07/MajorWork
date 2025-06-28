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

window.E2EE = {
  generateKeyPair,
  loadKeyPair,
  saveKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  encryptMessage,
  decryptMessage
};