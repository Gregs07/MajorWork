// DOM Elements
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authError = document.getElementById('authError');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');
const chatWindow = document.getElementById('chat-window');
const currentChatName = document.getElementById('current-chat-name');
const contactsList = document.getElementById('contacts-list');
const groupsList = document.getElementById('groups-list');
const requestsList = document.getElementById('requests-list');
const addContactBtn = document.getElementById('addContactBtn');
const createGroupBtn = document.getElementById('createGroupBtn');
const refreshContactsBtn = document.getElementById('refreshContactsBtn');
const addContactModal = document.getElementById('addContactModal');
const createGroupModal = document.getElementById('createGroupModal');
const newContactUsername = document.getElementById('newContactUsername');
const sendRequestBtn = document.getElementById('sendRequestBtn');
const newGroupName = document.getElementById('newGroupName');
const groupMembersList = document.getElementById('groupMembersList');
const confirmCreateGroupBtn = document.getElementById('confirmCreateGroupBtn');
const contactError = document.getElementById('contactError');
const groupError = document.getElementById('groupError');
const settingsBtn = document.getElementById('settingsBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiMenu = document.getElementById('emojiMenu');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const darkModeToggle = document.getElementById('darkModeToggle');
const accentColorPicker = document.getElementById('accentColorPicker');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const typingIndicator = document.getElementById('typing-indicator');
const topBar = document.getElementById('topBar');
const mainContainer = document.getElementById('mainContainer');
const userInfo = document.getElementById('userInfo');
const accountSettingsModal = document.getElementById('accountSettingsModal');
const closeAccountSettings = document.getElementById('closeAccountSettings');
const accountUsername = document.getElementById('accountUsername');
const fileInput = document.getElementById('fileInput');

// App State
let myUsername = null;
let currentChat = null;
let currentChatType = null; // 'contact' or 'group'
let myKeyPair = null; // <-- E2EE keypair
const EMOJI_LIST = ["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😍","😘","😗","😚","😙","🥰","😋","😜","🤪","😎","😭","😢","😤","😠","😡","🤬","🤗","😇","😏","😶","😬","🥲","🥹","🥺","😳","🥵","🥶","🥴","😵","🤯","😱","😨","😰","😥","😓","🤔","🤨","😐","😑","🙄","😤","😮‍💨","😮","😲","🥱","😴","🤤","😪","😵‍💫","😷","🤒","🤕","🤢","🤮","🤧","🥳","🥸","😺","😸","😹","😻","😼","😽","🙀","😿","😾","👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","🫶","🫰","👈","👉","👆","🖕","👇","☝️","👍","👎"];

// Initialize the app
init();

function init() {
  setupEventListeners();
  checkAuthStatus();
  applySettings();
}

function setupEventListeners() {
  // Auth
  authForm.onsubmit = handleLogin;
  registerBtn.onclick = handleRegister;
  logoutBtn.onclick = handleLogout;
  
  // Chat
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  
  // Contacts
  addContactBtn.addEventListener('click', () => showModal(addContactModal));
  createGroupBtn.addEventListener('click', () => {
    prepareGroupModal();
    showModal(createGroupModal);
  });
  refreshContactsBtn.addEventListener('click', loadContacts);
  sendRequestBtn.addEventListener('click', sendFriendRequest);
  confirmCreateGroupBtn.addEventListener('click', createGroup);
  
  // Modals
  closeSettings.addEventListener('click', () => hideModal(settingsModal));
  closeAccountSettings.addEventListener('click', () => hideModal(accountSettingsModal));
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      hideModal(e.target);
    }
  });
  
  // Emoji
  emojiBtn.addEventListener('click', showEmojiPicker);
  window.addEventListener('click', () => emojiMenu.classList.remove('show'));
  
  // Settings
  settingsBtn.addEventListener('click', () => showModal(settingsModal));
  darkModeToggle.addEventListener('change', toggleDarkMode);
  accentColorPicker.addEventListener('change', changeAccentColor);
  resetSettingsBtn.addEventListener('click', resetSettings);
}

// Show/hide app UI based on login status
function showAppUI(loggedIn) {
  if (loggedIn) {
    topBar.style.display = '';
    mainContainer.style.display = '';
  } else {
    topBar.style.display = 'none';
    mainContainer.style.display = 'none';
  }
}

// Username and account info
function updateUserInfo() {
  if (myUsername) {
    userInfo.innerHTML = `<span style="cursor:pointer;" id="openAccountSettings">${myUsername} &#x25BC;</span>`;
    document.getElementById('openAccountSettings').onclick = () => showModal(accountSettingsModal);
    accountUsername.textContent = myUsername;
  } else {
    userInfo.innerHTML = '';
    accountUsername.textContent = '';
  }
}

// Authentication Functions
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/whoami');
    const data = await response.json();
    myUsername = data.username;
    
    if (myUsername) {
      await setupE2EEKeys(myUsername);
      hideModal(authModal);
      showAppUI(true);
      updateUserInfo();
      loadContacts();
    } else {
      showModal(authModal);
      showAppUI(false);
      updateUserInfo();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showModal(authModal);
    showAppUI(false);
    updateUserInfo();
  }
}

async function setupE2EEKeys(username) {
  let keys = await window.E2EE.loadKeyPair();
  if (!keys) {
    keys = await window.E2EE.generateKeyPair();
    const pub = await window.E2EE.exportPublicKey(keys.publicKey);
    await fetch('/api/publickey', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, publicKey: pub})
    });
  }
  myKeyPair = keys;
}

async function handleLogin(e) {
  e.preventDefault();
  const username = authUsername.value.trim();
  const password = authPassword.value;
  
  if (!username || !password) {
    authError.textContent = 'Please enter both username and password';
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }
    
    await checkAuthStatus();
  } catch (error) {
    authError.textContent = error.message || 'Login error';
    console.error('Login failed:', error);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = authUsername.value.trim();
  const password = authPassword.value;
  
  if (!username || !password) {
    authError.textContent = 'Please enter both username and password';
    return;
  }

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Registration failed');
    }
    
    await checkAuthStatus();
  } catch (error) {
    authError.textContent = error.message || 'Registration error';
    console.error('Registration failed:', error);
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    myUsername = null;
    currentChat = null;
    contactsList.innerHTML = '';
    groupsList.innerHTML = '';
    requestsList.innerHTML = '';
    chatWindow.innerHTML = '<p id="no-messages">Select a contact or group to start chatting</p>';
    currentChatName.textContent = 'Select a chat';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    if (fileInput) fileInput.value = '';
    showModal(authModal);
    showAppUI(false);
    updateUserInfo();
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

// Contact Management
async function loadContacts() {
  if (!myUsername) return;
  
  try {
    const response = await fetch('/api/contacts');
    if (!response.ok) throw new Error('Failed to load contacts');
    
    const data = await response.json();
    
    // Clear existing lists
    contactsList.innerHTML = '';
    groupsList.innerHTML = '';
    requestsList.innerHTML = '';
    
    // Populate contacts
    data.contacts.forEach(contact => {
      const li = document.createElement('li');
      li.textContent = contact;
      li.setAttribute('data-contact', contact);
      li.addEventListener('click', () => openChat(contact, 'contact'));
      contactsList.appendChild(li);
    });
    
    // Populate groups
    data.groups.forEach(group => {
      const li = document.createElement('li');
      li.textContent = group.name;
      li.setAttribute('data-group', group.id);
      li.addEventListener('click', () => openChat(group.id, 'group'));
      groupsList.appendChild(li);
    });
    
    // Populate friend requests
    if (data.requests && data.requests.length > 0) {
      data.requests.forEach(request => {
        const li = document.createElement('li');
        li.className = 'request-item';
        li.innerHTML = `
          <span>${request.from}</span>
          <div class="request-actions">
            <button class="accept" data-id="${request.id}" type="button">Accept</button>
            <button class="reject" data-id="${request.id}" type="button">Reject</button>
          </div>
        `;
        requestsList.appendChild(li);
      });
      
      // Add event listeners to request buttons
      document.querySelectorAll('.accept').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          await handleFriendRequest(e.target.dataset.id, true);
          loadContacts();
        });
      });
      
      document.querySelectorAll('.reject').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          await handleFriendRequest(e.target.dataset.id, false);
          loadContacts();
        });
      });
    } else {
      requestsList.innerHTML = '<li class="no-requests">No pending requests</li>';
    }
    
  } catch (error) {
    console.error('Failed to load contacts:', error);
  }
}

async function sendFriendRequest() {
  const username = newContactUsername.value.trim();
  contactError.textContent = '';
  
  if (!username) {
    contactError.textContent = 'Please enter a username';
    return;
  }

  try {
    const response = await fetch('/api/contacts/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send request');
    }
    
    const data = await response.json();
    if (data.success) {
      hideModal(addContactModal);
      newContactUsername.value = '';
      loadContacts();
    }
  } catch (error) {
    console.error('Friend request error:', error);
    contactError.textContent = error.message;
  }
}

async function handleFriendRequest(requestId, accept) {
  try {
    const response = await fetch(`/api/contacts/request/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: accept ? 'accept' : 'reject' })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to process request');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to handle friend request:', error);
    throw error;
  }
}

// Group Management
async function prepareGroupModal() {
  try {
    const response = await fetch('/api/contacts');
    if (!response.ok) throw new Error('Failed to load contacts');
    
    const data = await response.json();
    
    groupMembersList.innerHTML = '<h4>Select Members:</h4>';
    
    if (data.contacts && data.contacts.length > 0) {
      data.contacts.forEach(contact => {
        const div = document.createElement('div');
        div.className = 'group-member-item';
        div.innerHTML = `
          <input type="checkbox" id="member-${contact}" value="${contact}">
          <label for="member-${contact}">${contact}</label>
        `;
        groupMembersList.appendChild(div);
      });
    } else {
      groupMembersList.innerHTML += '<p>No contacts available to add</p>';
    }
    
  } catch (error) {
    console.error('Failed to prepare group modal:', error);
    groupMembersList.innerHTML = '<p>Error loading contacts</p>';
  }
}

async function createGroup() {
  const groupName = newGroupName.value.trim();
  const members = Array.from(document.querySelectorAll('#groupMembersList input:checked'))
    .map(checkbox => checkbox.value);
  
  if (!groupName) {
    groupError.textContent = 'Please enter a group name';
    return;
  }
  
  if (members.length < 1) {
    groupError.textContent = 'Please select at least one member';
    return;
  }

  try {
    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: groupName, members })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create group');
    }
    
    const data = await response.json();
    if (data.success) {
      hideModal(createGroupModal);
      newGroupName.value = '';
      loadContacts();
      
      // Open the new group chat
      if (data.groupId) {
        openChat(data.groupId, 'group');
      }
    }
  } catch (error) {
    console.error('Failed to create group:', error);
    groupError.textContent = error.message;
  }
}

// Chat Functions
function openChat(id, type) {
  currentChat = id;
  currentChatType = type;

  // Update UI
  currentChatName.textContent = id;
  messageInput.disabled = false;
  sendBtn.disabled = false;
  if (fileInput) fileInput.disabled = false;

  // Highlight active chat
  const selector = type === 'contact' ? `[data-contact="${id}"]` : `[data-group="${id}"]`;
  document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-contact'));
  document.querySelector(selector)?.classList.add('active-contact');

  // Load messages
  loadMessages();
}

// --- E2EE send message ---
async function sendMessage() {
  const message = messageInput.value.trim();
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!message && !file) return;

  try {
    let endpoint, options;
    if (currentChatType === 'contact') {
      endpoint = `/api/conversations/${encodeURIComponent(currentChat)}`;
      let encryptedMsg = message;
      if (message) {
        // Encrypt with recipient's public key
        const resp = await fetch(`/api/publickey/${encodeURIComponent(currentChat)}`);
        if (!resp.ok) throw new Error('Failed to fetch recipient public key');
        const {publicKey: recipientPubB64} = await resp.json();
        const recipientPub = await window.E2EE.importPublicKey(recipientPubB64);
        encryptedMsg = await window.E2EE.encryptMessage(recipientPub, message);
      }
      if (file) {
        const formData = new FormData();
        formData.append('message', encryptedMsg);
        formData.append('file', file);
        options = { method: 'POST', body: formData };
      } else {
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: encryptedMsg })
        };
      }
    } else {
      // (Groups remain unencrypted here, can be upgraded to E2EE later)
      endpoint = `/api/groups/${encodeURIComponent(currentChat)}/messages`;
      if (file) {
        const formData = new FormData();
        formData.append('message', message);
        formData.append('file', file);
        options = { method: 'POST', body: formData };
      } else {
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        };
      }
    }

    const response = await fetch(endpoint, options);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send message');
    }
    messageInput.value = '';
    if (fileInput) fileInput.value = '';
    loadMessages();
  } catch (error) {
    console.error('Message send failed:', error);
    alert('Failed to send message');
  }
}

// --- E2EE load messages ---
async function loadMessages() {
  if (!currentChat) return;

  try {
    let endpoint;
    if (currentChatType === 'contact') {
      endpoint = `/api/conversations/${encodeURIComponent(currentChat)}`;
    } else {
      endpoint = `/api/groups/${encodeURIComponent(currentChat)}/messages`;
    }

    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Failed to load messages');
    const messages = await response.json();

    chatWindow.innerHTML = '';

    if (messages.length === 0) {
      chatWindow.innerHTML = '<p id="no-messages">No messages yet</p>';
      return;
    }

    // Decrypt contact messages if E2EE
    if (currentChatType === 'contact' && myKeyPair && myKeyPair.privateKey) {
      for (const msg of messages) {
        if (msg.message && msg.sender !== myUsername) {
          // Decrypt received messages
          try {
            msg.message = await window.E2EE.decryptMessage(myKeyPair.privateKey, msg.message);
          } catch (e) {
            msg.message = '[Unable to decrypt]';
          }
        }
      }
    }

    messages.forEach((msg, idx) => {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('message-container');
      if (msg.sender === myUsername) {
        messageDiv.style.marginLeft = 'auto';
        messageDiv.style.marginRight = '0';
      }

      const messageContent = document.createElement('div');
      messageContent.classList.add('message');
      messageContent.classList.add(msg.sender === myUsername ? 'mine' : 'other');

      if (msg.sender === myUsername) {
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.className = 'edit-btn';
        editBtn.title = 'Edit message';
        editBtn.onclick = () => editMessagePrompt(idx, msg.message);
        messageContent.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = 'Delete message';
        deleteBtn.onclick = () => deleteMessage(idx);
        messageContent.appendChild(deleteBtn);
      }

      const senderSpan = document.createElement('span');
      senderSpan.className = 'message-sender';
      senderSpan.textContent = msg.sender;

      const textSpan = document.createElement('span');
      textSpan.textContent = msg.message;

      messageContent.appendChild(senderSpan);
      messageContent.appendChild(document.createElement('br'));
      messageContent.appendChild(textSpan);

      // Show file if present
      if (msg.file) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'attach';
        let isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(msg.file);
        if (isImage) {
          const img = document.createElement('img');
          img.src = msg.file;
          img.alt = 'attachment';
          fileDiv.appendChild(img);
        } else {
          const link = document.createElement('a');
          link.href = msg.file;
          link.textContent = '📎 Download attachment';
          link.target = '_blank';
          fileDiv.appendChild(link);
        }
        messageContent.appendChild(document.createElement('br'));
        messageContent.appendChild(fileDiv);
      }

      messageDiv.appendChild(messageContent);
      chatWindow.appendChild(messageDiv);
    });

    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch (error) {
    console.error('Failed to load messages:', error);
    chatWindow.innerHTML = '<p style="color:var(--error)">Failed to load messages</p>';
  }
}

// --- Edit message prompt ---
function editMessagePrompt(idx, oldMsg) {
  const newMsg = prompt('Edit your message:', oldMsg);
  if (newMsg === null || newMsg.trim() === oldMsg) return;
  updateMessage(idx, newMsg.trim());
}

async function updateMessage(idx, newMsg) {
  try {
    const endpoint = `/api/messages/${currentChatType}/${encodeURIComponent(currentChat)}/${idx}`;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: newMsg })
    });
    if (!response.ok) throw new Error('Edit failed');
    loadMessages();
  } catch (e) {
    alert('Failed to edit message');
  }
}

// --- Delete message ---
async function deleteMessage(idx) {
  if (!confirm('Delete this message?')) return;
  try {
    const endpoint = `/api/messages/${currentChatType}/${encodeURIComponent(currentChat)}/${idx}`;
    const response = await fetch(endpoint, { method: 'DELETE' });
    if (!response.ok) throw new Error('Delete failed');
    loadMessages();
  } catch (e) {
    alert('Failed to delete message');
  }
}

// UI Helpers
function showModal(modal) {
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function hideModal(modal) {
  modal.classList.remove('show');
  document.body.style.overflow = '';
}

function showEmojiPicker(e) {
  e.stopPropagation();
  
  emojiMenu.innerHTML = '';
  EMOJI_LIST.forEach(emoji => {
    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = emoji;
    emojiSpan.addEventListener('click', () => {
      const cursorPos = messageInput.selectionStart;
      messageInput.value = messageInput.value.substring(0, cursorPos) + emoji + 
                          messageInput.value.substring(cursorPos);
      messageInput.focus();
      messageInput.selectionStart = messageInput.selectionEnd = cursorPos + emoji.length;
      emojiMenu.classList.remove('show');
    });
    emojiMenu.appendChild(emojiSpan);
  });
  
  const rect = emojiBtn.getBoundingClientRect();
  emojiMenu.style.left = `${rect.left}px`;
  emojiMenu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
  emojiMenu.classList.add('show');
}

// Settings
function getSettings() {
  const settings = localStorage.getItem('chatSettings');
  return settings ? JSON.parse(settings) : {};
}

function saveSettings(settings) {
  localStorage.setItem('chatSettings', JSON.stringify(settings));
}

function applySettings() {
  const settings = getSettings();
  
  // Dark mode
  if (settings.darkMode) {
    document.body.classList.add('dark');
    darkModeToggle.checked = true;
  } else {
    document.body.classList.remove('dark');
    darkModeToggle.checked = false;
  }
  
  // Accent color
  if (settings.accentColor) {
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    accentColorPicker.value = settings.accentColor;
  } else {
    document.documentElement.style.setProperty('--accent', '#a8e6cf');
    accentColorPicker.value = '#a8e6cf';
  }
}

function toggleDarkMode() {
  const settings = getSettings();
  settings.darkMode = darkModeToggle.checked;
  saveSettings(settings);
  applySettings();
}

function changeAccentColor() {
  const settings = getSettings();
  settings.accentColor = accentColorPicker.value;
  saveSettings(settings);
  applySettings();
}

function resetSettings() {
  localStorage.removeItem('chatSettings');
  applySettings();
}

// Typing Indicator
let typingTimeout;

messageInput.addEventListener('input', () => {
  if (!currentChat) return;
  
  clearTimeout(typingTimeout);
  
  // Send typing indicator
  const endpoint = currentChatType === 'contact'
    ? `/api/typing/${encodeURIComponent(currentChat)}`
    : `/api/groups/${encodeURIComponent(currentChat)}/typing`;
  
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ typing: true })
  });
  
  // Set timeout to stop typing indicator
  typingTimeout = setTimeout(() => {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typing: false })
    });
  }, 2000);
});

// Check for other user's typing
setInterval(async () => {
  if (!currentChat || !myUsername) return;
  
  try {
    const endpoint = currentChatType === 'contact'
      ? `/api/typing/${encodeURIComponent(currentChat)}`
      : `/api/groups/${encodeURIComponent(currentChat)}/typing`;
    
    const response = await fetch(endpoint);
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.typing && data.user !== myUsername) {
      typingIndicator.textContent = `${data.user} is typing...`;
    } else {
      typingIndicator.textContent = '';
    }
  } catch (error) {
    console.error('Failed to check typing status:', error);
  }
}, 1000);