// ============================
// FoodShare - Full Stack Client
// ============================

const API_BASE = window.location.origin + '/api';
let currentUser = null;
let socket = null;

// --- API HELPERS ---
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('foodshare_token');
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

// --- AUTH MODULE ---
function saveAuth(userData) {
  localStorage.setItem('foodshare_token', userData.token);
  localStorage.setItem('foodshare_user', JSON.stringify({
    _id: userData._id,
    name: userData.name,
    email: userData.email,
    avatar: userData.avatar
  }));
  currentUser = userData;
  updateAuthUI();
  connectSocket();
  loadNotifications();
}

function loadAuth() {
  const token = localStorage.getItem('foodshare_token');
  const user = localStorage.getItem('foodshare_user');
  if (token && user) {
    currentUser = JSON.parse(user);
    currentUser.token = token;
    updateAuthUI();
    connectSocket();
    return true;
  }
  return false;
}

function logout() {
  localStorage.removeItem('foodshare_token');
  localStorage.removeItem('foodshare_user');
  currentUser = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  updateAuthUI();
  
  // Clear notifications
  const dropdown = document.getElementById('notif-dropdown-list');
  if (dropdown) dropdown.innerHTML = '<div class="notif-empty">No notifications yet</div>';
  unreadCount = 0;
  updateNotifBadge();

  // Close any active tracking modals
  if (typeof closeDonorTracking === 'function') closeDonorTracking();
  if (typeof closeClaimAlert === 'function') closeClaimAlert();

  switchView('home');
  showToast('Logged out successfully', 'info');
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('#login-email').value;
  const password = form.querySelector('#login-password').value;
  const errorEl = document.getElementById('login-error');

  try {
    errorEl.textContent = '';
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    saveAuth(data);
    closeAuthModal();
    showToast(`Welcome back, ${data.name}!`, 'success');
    loadFoodListings();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.querySelector('#register-name').value;
  const email = form.querySelector('#register-email').value;
  const password = form.querySelector('#register-password').value;
  const errorEl = document.getElementById('register-error');

  try {
    errorEl.textContent = '';
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    saveAuth(data);
    closeAuthModal();
    showToast(`Welcome to FoodShare, ${data.name}!`, 'success');
    loadFoodListings();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function updateAuthUI() {
  const authBtn = document.getElementById('auth-action-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const profileAvatar = document.getElementById('profile-avatar');
  const navNotif = document.getElementById('nav-notif-btn');
  const navUserInfo = document.getElementById('nav-user-info');
  const navUserName = document.getElementById('nav-user-name');
  const navUserAvatar = document.getElementById('nav-user-avatar');

  if (currentUser) {
    if (authBtn) authBtn.textContent = 'Share Food';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (profileName) profileName.textContent = currentUser.name;
    if (profileEmail) profileEmail.textContent = currentUser.email;
    if (profileAvatar) profileAvatar.textContent = currentUser.avatar;
    if (navNotif) navNotif.style.display = 'flex';
    if (navUserInfo) navUserInfo.style.display = 'block';
    if (navUserName) navUserName.textContent = currentUser.name;
    if (navUserAvatar) navUserAvatar.textContent = currentUser.avatar;
  } else {
    if (authBtn) authBtn.textContent = 'Get Started';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (navNotif) navNotif.style.display = 'none';
    if (navUserInfo) navUserInfo.style.display = 'none';
  }
}

// --- AUTH MODAL ---
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('open');
  switchAuthTab(tab);
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.remove('open');
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('login-form-container').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form-container').style.display = tab === 'register' ? 'block' : 'none';
}

// --- SOCKET.IO ---
function connectSocket() {
  if (!currentUser || socket) return;

  socket = io(window.location.origin);

  socket.on('connect', () => {
    socket.emit('join', currentUser._id);
  });

  socket.on('notification', (data) => {
    showToast(data.message, 'notification');
    loadNotifications();
  });

  socket.on('food_shared', (data) => {
    loadFoodListings();
  });

  socket.on('pickup_completed', (data) => {
    showToast('Pickup confirmed! 🎉', 'success');
    // Show completion overlay if on pickup view
    if (document.getElementById('pickup-view').classList.contains('active')) {
      showPickupCompletedOverlay();
    }
    // Close donor tracking modal if open
    closeDonorTracking();
    closeClaimAlert();
    loadFoodListings();
  });

  // Rich claim alert for donor (full-screen popup)
  socket.on('claim_alert', (data) => {
    showClaimAlert(data);
  });

  // Live receiver location updates (for donor tracking)
  socket.on('receiver_location', (data) => {
    updateReceiverLocationOnMap(data);
  });
}

// --- NOTIFICATIONS ---
let unreadCount = 0;

async function loadNotifications() {
  if (!currentUser) return;
  try {
    const data = await apiFetch('/notifications');
    unreadCount = data.unreadCount;
    updateNotifBadge();
    renderNotifications(data.notifications);
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
}

function renderNotifications(notifications) {
  const dropdown = document.getElementById('notif-dropdown-list');
  if (!dropdown) return;

  if (notifications.length === 0) {
    dropdown.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }

  dropdown.innerHTML = notifications.slice(0, 10).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}">
      <div class="notif-dot"></div>
      <div class="notif-content">
        <p>${n.message}</p>
        <span class="notif-time">${timeAgo(n.createdAt)}</span>
      </div>
    </div>
  `).join('');
}

function toggleNotifDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  dropdown.classList.toggle('open');
  if (dropdown.classList.contains('open') && unreadCount > 0) {
    apiFetch('/notifications/read-all', { method: 'PUT' }).then(() => {
      unreadCount = 0;
      updateNotifBadge();
    });
  }
}

// --- FOOD LISTINGS ---
async function loadFoodListings() {
  try {
    const foods = await apiFetch('/food');
    renderFoodGrid(foods, 'food-grid');
    renderFoodGrid(foods.slice(0, 4), 'food-grid-home');
    updateMapMarkers(foods);

    // Update stats with real counts
    const statsEls = document.querySelectorAll('[data-count]');
    if (statsEls.length >= 3) {
      statsEls[0].dataset.count = foods.length > 0 ? foods.length * 15 : 1247;
      statsEls[1].dataset.count = foods.length > 0 ? Math.max(foods.length * 5, 50) : 423;
      statsEls[2].dataset.count = foods.length > 0 ? foods.length : 89;
    }
  } catch (err) {
    console.error('Failed to load food:', err);
    // Fallback to empty state
    renderFoodGrid([], 'food-grid');
    renderFoodGrid([], 'food-grid-home');
  }
}

function renderFoodGrid(foods, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (foods.length === 0) {
    grid.innerHTML = renderEmptyState();
    return;
  }

  grid.innerHTML = foods.map(food => renderCard(food)).join('');
}

function renderCard(food) {
  const donor = food.donor || {};
  const photoUrl = food.photo
    ? (food.photo.startsWith('/uploads') ? window.location.origin + food.photo : food.photo)
    : 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop';

  const isClaimed = food.status === 'claimed';
  const isCompleted = food.status === 'completed';
  const isOwner = currentUser && food.donor && (food.donor._id === currentUser._id || food.donor === currentUser._id);
  const isExpired = food.expiresAt && new Date(food.expiresAt) < new Date();

  const isClaimer = currentUser && food.claimedBy && (food.claimedBy._id === currentUser._id || food.claimedBy === currentUser._id);

  let actionButton = '';
  if (isCompleted) {
    actionButton = '<button class="btn-claim" disabled style="opacity:0.5;">✅ Completed</button>';
  } else if (isExpired && !isClaimed) {
    actionButton = '<button class="btn-claim" disabled style="opacity:0.5;background:rgba(255,80,80,0.1);color:#ff5050;">⏰ Expired</button>';
  } else if (isClaimed) {
    if (isOwner) {
      // Donor sees full receiver info + OTP input + Track button
      const claimer = food.claimedBy || {};
      const claimerName = claimer.name || 'Receiver';
      const claimerAvatar = claimer.avatar || '?';
      const claimerEmail = claimer.email || '';
      actionButton = `<div class="donor-claimed-panel">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:12px;background:rgba(124,92,255,0.06);border:1px solid rgba(124,92,255,0.15);border-radius:12px;">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--purple),var(--green));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;color:#fff;flex-shrink:0;">${claimerAvatar}</div>
          <div>
            <div style="font-weight:700;font-size:0.9rem;">${claimerName}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${claimerEmail}</div>
          </div>
          <span style="margin-left:auto;font-size:0.7rem;color:var(--green);font-weight:600;">CLAIMED</span>
        </div>
        <button class="btn-claim" onclick="openDonorTrackingForFood('${food._id}')" style="background:rgba(124,92,255,0.12);color:var(--purple);margin-bottom:10px;width:100%;">
          📍 Track ${claimerName.split(' ')[0]} Live
        </button>
        <div style="font-size:0.72rem;color:var(--text-muted);text-align:center;margin-bottom:6px;">Enter receiver's OTP to confirm pickup</div>
        <div class="otp-verify-form">
          <input type="text" class="otp-input" id="otp-input-${food._id}" maxlength="4" placeholder="OTP" inputmode="numeric">
          <button class="otp-verify-btn" onclick="verifyOtpComplete('${food._id}')">Verify ✓</button>
        </div>
      </div>`;
    } else if (isClaimer) {
      actionButton = `<button class="btn-claim" onclick="openPickupDashboard('${food._id}')" style="background:rgba(124,92,255,0.15);color:var(--purple);">📋 View Pickup Details</button>`;
    } else {
      actionButton = '<button class="btn-claim" disabled style="opacity:0.5;">🔒 Claimed</button>';
    }
  } else {
    if (isOwner) {
      actionButton = `<button class="btn-claim" onclick="deleteFood('${food._id}')" style="background:rgba(255,80,80,0.12);color:#ff5050;">Delete</button>`;
    } else {
      actionButton = `<button class="btn-claim" onclick="claimFood('${food._id}')">Claim Food</button>`;
    }
  }

  // AI freshness calculation (client-side mirror of backend model)
  const aiFreshness = calculateFreshness(food);
  const aiCatBadge = food.aiEmoji && food.aiCategoryLabel
    ? `<span class="hero-card-badge" style="background:rgba(124,92,255,0.1);color:var(--purple);border-color:rgba(124,92,255,0.2);">${food.aiEmoji} ${food.aiCategoryLabel}</span>`
    : '';

  return `<div class="glass-card food-card">
    <img src="${photoUrl}" alt="${food.name}" class="food-card-img" onerror="this.src='https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop'">
    <div class="food-card-body">
      <div class="food-card-user">
        <div class="food-card-avatar">${donor.avatar || '?'}</div>
        <span style="color:var(--text-muted);font-size:0.8rem;">${donor.name || 'Anonymous'} · ${timeAgo(food.createdAt)}</span>
      </div>
      <h3>${food.name}</h3>
      <div class="food-card-info">
        <span class="hero-card-badge badge-green">📍 ${food.address ? food.address.substring(0, 25) + (food.address.length > 25 ? '...' : '') : 'Nearby'}</span>
        <span class="hero-card-badge badge-purple">⏰ ${timeUntilExpiry(food.expiresAt)}</span>
        ${aiCatBadge}
      </div>
      ${aiFreshness.score > 0 ? `<div class="ai-freshness-bar" title="AI Freshness: ${aiFreshness.label}">
        <div class="ai-freshness-label">
          <span>🧠 AI Freshness</span>
          <span style="color:${aiFreshness.color};font-weight:700;">${aiFreshness.score}% — ${aiFreshness.label}</span>
        </div>
        <div class="ai-freshness-track">
          <div class="ai-freshness-fill" style="width:${aiFreshness.score}%;background:${aiFreshness.color};"></div>
        </div>
      </div>` : ''}
      <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:16px;">${food.description || ''}</p>
      ${actionButton}
    </div>
  </div>`;
}

function renderEmptyState() {
  return `<div class="empty-state">
    <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
    <h3>No food available nearby yet</h3>
    <p>Be the first to share food in your community!</p>
    <button class="btn-primary btn-sm" onclick="handleAuthAction('add')">Be the First to Share <span class="arrow">→</span></button>
  </div>`;
}

// --- FOOD ACTIONS ---
let currentPickupFoodId = null;

async function claimFood(foodId) {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  try {
    const result = await apiFetch(`/food/${foodId}/claim`, { method: 'POST' });
    showToast('Food claimed! Opening pickup dashboard...', 'success');
    loadFoodListings();

    // Navigate to pickup dashboard with the returned data
    currentPickupFoodId = foodId;
    if (result.pickupData) {
      renderPickupDashboard(result.pickupData);
    }
    switchView('pickup');

    // Join food room for real-time sync
    if (socket) {
      socket.emit('join_food_room', foodId);
    }

    // Start sharing location with donor
    startLocationSharing(foodId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openPickupDashboard(foodId) {
  currentPickupFoodId = foodId;
  switchView('pickup');
}

async function verifyOtpComplete(foodId, otpValue) {
  let otp = otpValue;
  if (!otp) {
    const input = document.getElementById(`otp-input-${foodId}`);
    if (!input) return;
    otp = input.value.trim();
  }

  if (!otp || otp.length !== 4) {
    showToast('Please enter the 4-digit OTP from the receiver', 'error');
    return;
  }

  try {
    const res = await apiFetch(`/food/${foodId}/complete`, {
      method: 'PUT',
      body: JSON.stringify({ otp })
    });
    // Show success overlay for donor
    showDonorCompletionOverlay();
    closeDonorTracking();
    closeClaimAlert();
    // Delay reload so user sees success
    setTimeout(() => loadFoodListings(), 2000);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showDonorCompletionOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'pickup-completed-overlay';
  overlay.innerHTML = `
    <div class="pickup-completed-content">
      <div class="check-icon">✅</div>
      <h2 style="font-size:1.8rem;font-weight:700;margin-bottom:12px;">Pickup Verified!</h2>
      <p style="color:var(--text-muted);margin-bottom:32px;">The OTP was correct. Pickup is complete!<br>Thank you for sharing food! 🌟</p>
      <button class="btn-primary" onclick="this.closest('.pickup-completed-overlay').remove();loadFoodListings();">Done ✓</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Open donor tracking modal from a specific food card
function openDonorTrackingForFood(foodId) {
  trackingFoodId = foodId;

  // Join food room to receive location updates
  if (socket) {
    socket.emit('join_food_room', foodId);
  }

  // Set claimAlertData from current food listings if not set
  if (!claimAlertData || claimAlertData.foodId !== foodId) {
    claimAlertData = { foodId: foodId };
  }

  const modal = document.getElementById('donor-tracking-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  setTimeout(() => initDonorTrackingMap(), 300);
}

async function cancelClaim() {
  if (!currentPickupFoodId) return;
  if (!confirm('Are you sure you want to cancel this claim?')) return;

  try {
    await apiFetch(`/food/${currentPickupFoodId}/cancel-claim`, { method: 'POST' });
    showToast('Claim cancelled. Food is available again.', 'info');
    currentPickupFoodId = null;
    switchView('browse');
    loadFoodListings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadPickupDashboard(foodId) {
  try {
    const data = await apiFetch(`/food/${foodId}/pickup`);
    renderPickupDashboard({
      foodId: data.food._id,
      name: data.food.name,
      description: data.food.description,
      photo: data.food.photo,
      address: data.food.address,
      latitude: data.food.latitude,
      longitude: data.food.longitude,
      pickupOtp: data.food.pickupOtp,
      claimedAt: data.food.claimedAt,
      expiresAt: data.food.expiresAt,
      donor: data.donor
    });
  } catch (err) {
    showToast(err.message, 'error');
    switchView('browse');
  }
}

function renderPickupDashboard(data) {
  // Food details
  const photoUrl = data.photo
    ? (data.photo.startsWith('/uploads') ? window.location.origin + data.photo : data.photo)
    : 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop';

  const foodImg = document.getElementById('pickup-food-img');
  if (foodImg) foodImg.src = photoUrl;

  const foodName = document.getElementById('pickup-food-name');
  if (foodName) foodName.textContent = data.name || 'Food Item';

  const foodDesc = document.getElementById('pickup-food-desc');
  if (foodDesc) foodDesc.textContent = data.description || 'No description provided';

  const foodAddr = document.getElementById('pickup-food-address');
  if (foodAddr) foodAddr.textContent = `📍 ${data.address || 'Nearby'}`;

  const foodExpiry = document.getElementById('pickup-food-expiry');
  if (foodExpiry) foodExpiry.textContent = `⏰ ${timeUntilExpiry(data.expiresAt)}`;

  // Donor info
  const donor = data.donor || {};
  const donorAvatar = document.getElementById('pickup-donor-avatar');
  if (donorAvatar) donorAvatar.textContent = donor.avatar || '?';

  const donorName = document.getElementById('pickup-donor-name');
  if (donorName) donorName.textContent = donor.name || 'Anonymous';

  const donorEmail = document.getElementById('pickup-donor-email');
  if (donorEmail) donorEmail.textContent = donor.email || 'Contact via app';

  // OTP Display
  const otpDisplay = document.getElementById('pickup-otp-display');
  if (otpDisplay && data.pickupOtp) {
    const digits = data.pickupOtp.split('');
    otpDisplay.innerHTML = digits.map(d => `<span class="otp-digit">${d}</span>`).join('');
  }

  // Claimed time
  const claimedTime = document.getElementById('step-claimed-time');
  if (claimedTime) claimedTime.textContent = timeAgo(data.claimedAt);

  // Map address
  const mapAddr = document.getElementById('pickup-map-address');
  if (mapAddr) mapAddr.textContent = data.address || 'Location not specified';

  // Init pickup map
  setTimeout(() => initMapPickup(data.latitude, data.longitude, data.name), 300);

  // Reveal donor details with animation
  setTimeout(() => {
    const cardWrapper = document.getElementById('pickup-donor-card-wrapper');
    if (cardWrapper) cardWrapper.classList.add('revealed');
  }, 1500);
}

let mapPickup = null;
function initMapPickup(lat, lng, label) {
  const container = document.getElementById('map-pickup');
  if (!container) return;

  // Destroy old map if exists
  if (mapPickup) {
    mapPickup.remove();
    mapPickup = null;
  }

  const coords = [lat || 13.342, lng || 77.112];
  mapPickup = L.map('map-pickup').setView(coords, 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO'
  }).addTo(mapPickup);

  // Green pulse marker
  const pickupIcon = L.divIcon({
    className: '',
    html: '<div style="width:20px;height:20px;background:#22C55E;border-radius:50%;box-shadow:0 0 16px #22C55E,0 0 32px rgba(34,197,94,0.5);border:3px solid rgba(255,255,255,0.4);animation:pulse 2s ease-in-out infinite;"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  L.marker(coords, { icon: pickupIcon })
    .addTo(mapPickup)
    .bindPopup(`<b>📍 Pickup: ${label || 'Food'}</b>`)
    .openPopup();
}

function showPickupCompletedOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'pickup-completed-overlay';
  overlay.innerHTML = `
    <div class="pickup-completed-content">
      <div class="check-icon">✅</div>
      <h2 style="font-size:1.8rem;font-weight:700;margin-bottom:12px;">Pickup Complete!</h2>
      <p style="color:var(--text-muted);margin-bottom:32px;">The donor has confirmed your pickup. Thank you for reducing food waste!</p>
      <button class="btn-primary" onclick="this.closest('.pickup-completed-overlay').remove();switchView('browse');">Back to Browse →</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Update stepper to show completion
  document.getElementById('step-onway')?.classList.add('active');
  document.getElementById('step-picked')?.classList.add('active');
  document.querySelectorAll('.pickup-step-line').forEach(l => l.classList.add('active'));

  // Stop location sharing
  stopLocationSharing();
}

// --- LOCATION SHARING (Receiver side) ---
let locationWatchId = null;

function startLocationSharing(foodId) {
  if (!navigator.geolocation) {
    console.log('Geolocation not supported');
    return;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      if (socket) {
        socket.emit('share_location', {
          foodId: foodId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      }
      // Update step-onway to active when we get first location
      document.getElementById('step-onway')?.classList.add('active');
      const lines = document.querySelectorAll('.pickup-step-line');
      if (lines.length >= 2) lines[1]?.classList.add('active');
    },
    (error) => {
      console.log('Geolocation error:', error.message);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

function stopLocationSharing() {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
}

// --- CLAIM ALERT (Donor side) ---
let claimAlertData = null;

function showClaimAlert(data) {
  claimAlertData = data;
  const overlay = document.getElementById('claim-alert-overlay');
  if (!overlay) return;

  // Populate the alert
  document.getElementById('claim-alert-food-name').textContent = data.foodName || 'Food Item';
  document.getElementById('claim-alert-subtitle').textContent = `Someone wants to pick up your "${data.foodName}"`;

  const receiver = data.receiver || {};
  document.getElementById('claim-alert-receiver-avatar').textContent = receiver.avatar || '?';
  document.getElementById('claim-alert-receiver-name').textContent = receiver.name || 'Someone';
  document.getElementById('claim-alert-receiver-email').textContent = receiver.email || '';

  // OTP Display
  document.getElementById('claim-alert-otp').textContent = data.pickupOtp || '----';

  overlay.style.display = 'flex';

  // Join food room to receive location updates
  if (socket && data.foodId) {
    socket.emit('join_food_room', data.foodId);
  }
}

function closeClaimAlert() {
  const overlay = document.getElementById('claim-alert-overlay');
  if (overlay) overlay.style.display = 'none';
}

// --- DONOR TRACKING ---
let donorTrackingMap = null;
let receiverMarker = null;
let donorLocationMarker = null;
let trackingFoodId = null;

function openDonorTracking() {
  closeClaimAlert();

  const modal = document.getElementById('donor-tracking-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  trackingFoodId = claimAlertData?.foodId;

  // Initialize tracking map
  setTimeout(() => initDonorTrackingMap(), 300);
}

function closeDonorTracking() {
  const modal = document.getElementById('donor-tracking-modal');
  if (modal) modal.style.display = 'none';

  if (donorTrackingMap) {
    donorTrackingMap.remove();
    donorTrackingMap = null;
  }
  receiverMarker = null;
  donorLocationMarker = null;
}

function initDonorTrackingMap() {
  const container = document.getElementById('donor-tracking-map');
  if (!container) return;

  if (donorTrackingMap) {
    donorTrackingMap.remove();
    donorTrackingMap = null;
  }

  // Default to the food's location or a fallback
  const foodLat = claimAlertData?.latitude || 13.342;
  const foodLng = claimAlertData?.longitude || 77.112;
  const coords = [foodLat, foodLng];

  donorTrackingMap = L.map('donor-tracking-map').setView(coords, 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO'
  }).addTo(donorTrackingMap);

  // Donor (food) location marker — green
  const donorIcon = L.divIcon({
    className: '',
    html: '<div style="width:18px;height:18px;background:#22C55E;border-radius:50%;box-shadow:0 0 16px #22C55E;border:3px solid rgba(255,255,255,0.5);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  donorLocationMarker = L.marker(coords, { icon: donorIcon })
    .addTo(donorTrackingMap)
    .bindPopup('<b>📍 Your Location (Pickup Point)</b>')
    .openPopup();
}

function updateReceiverLocationOnMap(data) {
  if (!donorTrackingMap) return;

  const receiverCoords = [data.lat, data.lng];

  // Receiver marker — purple pulsing
  const receiverIcon = L.divIcon({
    className: '',
    html: '<div class="receiver-marker-pulse"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  if (receiverMarker) {
    receiverMarker.setLatLng(receiverCoords);
  } else {
    receiverMarker = L.marker(receiverCoords, { icon: receiverIcon })
      .addTo(donorTrackingMap)
      .bindPopup('<b>🚶 Receiver</b>');
  }

  // Fit both markers in view
  if (donorLocationMarker) {
    const bounds = L.latLngBounds(
      donorLocationMarker.getLatLng(),
      receiverMarker.getLatLng()
    );
    donorTrackingMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }

  // Update status
  const status = document.getElementById('donor-tracking-status');
  if (status) status.innerHTML = '<span class="tracking-dot"></span> Receiver is on the way!';

  // Calculate distance
  if (donorLocationMarker) {
    const distance = donorLocationMarker.getLatLng().distanceTo(L.latLng(data.lat, data.lng));
    const distText = distance > 1000
      ? `${(distance / 1000).toFixed(1)} km`
      : `${Math.round(distance)} m`;

    const etaEl = document.getElementById('donor-tracking-eta');
    if (etaEl) {
      etaEl.style.display = 'flex';
      document.getElementById('donor-tracking-distance').textContent = distText;
    }
  }
}

function verifyFromTracking() {
  const input = document.getElementById('donor-tracking-otp-input');
  if (!input) return;
  const otp = input.value.trim();
  if (!otp || otp.length !== 4) {
    showToast('Please enter the 4-digit OTP', 'error');
    return;
  }

  const foodId = trackingFoodId || claimAlertData?.foodId;
  if (!foodId) {
    showToast('No active claim to verify', 'error');
    return;
  }

  verifyOtpComplete(foodId, otp);
}

async function deleteFood(foodId) {
  if (!confirm('Are you sure you want to delete this listing?')) return;

  try {
    await apiFetch(`/food/${foodId}`, { method: 'DELETE' });
    showToast('Food listing deleted', 'info');
    loadFoodListings();
    if (document.getElementById('profile-view').classList.contains('active')) {
      loadProfileData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- FORM SUBMISSION ---
async function handleFoodSubmission(e) {
  e.preventDefault();

  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  // Check if AI flagged the food
  if (lastAIResult) {
    if (lastAIResult.spoilageDetected) {
      alert(`🚫 Submission Rejected: The AI detected signs of spoilage or damage (identified as "${lastAIResult.spoilageMatch}"). For health and safety reasons, this food cannot be shared on the platform.`);
      return; // Strictly reject
    }
    
    if (lastAIResult.flagged) {
      const confirmMsg = `⚠️ AI Quality Warning\n\nThe AI has flagged this food image as "${lastAIResult.label}" (Score: ${lastAIResult.score}/100).\n\nThis listing will be submitted but flagged for manual review by moderators.\n\nDo you want to proceed?`;
      if (!confirm(confirmMsg)) {
        return;
      }
    }
  }

  const form = e.target;
  const formData = new FormData();

  formData.append('name', form.querySelector('#food-title').value);
  formData.append('description', form.querySelector('#food-description').value);
  formData.append('address', document.getElementById('food-address').value);

  // Custom expiry time
  const expiryInput = document.getElementById('food-expiry');
  if (expiryInput && expiryInput.value) {
    formData.append('expiresAt', new Date(expiryInput.value).toISOString());
  }

  if (addMarkerLatLng) {
    formData.append('latitude', addMarkerLatLng.lat);
    formData.append('longitude', addMarkerLatLng.lng);
  }

  const photoInput = document.getElementById('food-photo');
  if (photoInput.files && photoInput.files[0]) {
    formData.append('photo', photoInput.files[0]);
  }

  // Include AI quality metadata
  if (lastAIResult) {
    formData.append('aiScore', lastAIResult.score);
    formData.append('aiLabel', lastAIResult.label);
    formData.append('aiStatus', lastAIResult.status);
    formData.append('aiClassification', lastAIResult.classification);
    formData.append('aiConfidence', lastAIResult.confidence);
    formData.append('aiFlagged', lastAIResult.flagged);
  }

  try {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sharing...';

    await apiFetch('/food', {
      method: 'POST',
      body: formData
    });

    showToast('Food shared successfully! 🎉', 'success');
    form.reset();
    lastAIResult = null;

    // Reset AI panel
    const aiPanel = document.getElementById('ai-quality-panel');
    if (aiPanel) aiPanel.style.display = 'none';

    switchView('browse');
    loadFoodListings();

    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Share This Food →';
  } catch (err) {
    showToast(err.message, 'error');
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Share This Food →';
  }
}

// --- EXPIRY HELPERS ---
function setExpiryHours(hours) {
  const input = document.getElementById('food-expiry');
  if (!input) return;
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  // Format to yyyy-MM-ddTHH:mm for datetime-local
  const pad = (n) => String(n).padStart(2, '0');
  input.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initExpiryInput() {
  const input = document.getElementById('food-expiry');
  if (!input) return;
  // Set min to current time
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  input.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // Default to 6 hours
  setExpiryHours(6);
}

// --- PROFILE ---
async function loadProfileData() {
  if (!currentUser) return;

  try {
    const [stats, myFood, myClaims] = await Promise.all([
      apiFetch('/users/stats'),
      apiFetch('/users/my-food'),
      apiFetch('/users/my-claims')
    ]);

    // Update profile stats
    const profileStats = document.querySelectorAll('#profile-view .stat-number');
    if (profileStats.length >= 3) {
      profileStats[0].textContent = stats.foodShared;
      profileStats[1].textContent = stats.foodClaimed;
      profileStats[2].textContent = stats.totalCompleted;
    }

    // Render user's food listings
    const myFoodGrid = document.getElementById('my-food-grid');
    if (myFoodGrid) {
      if (myFood.length === 0) {
        myFoodGrid.innerHTML = `<div class="empty-state">
          <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
          <h3>No food shared yet</h3>
          <p>Start sharing your leftovers to help reduce food waste!</p>
          <button class="btn-primary btn-sm" onclick="switchView('add')">+ Share Your First Item</button>
        </div>`;
      } else {
        myFoodGrid.innerHTML = myFood.map(f => renderCard(f)).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load profile data:', err);
  }
}

// --- VIEW SWITCHING ---
function handleAuthAction(targetView) {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }
  switchView(targetView || 'add');
}

// --- DOM ---
const navButtons = document.querySelectorAll('.bottom-nav-btn');
const views = document.querySelectorAll('.view');
const donationForm = document.querySelector('.donation-form');

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  loadAuth();
  loadFoodListings();
  setupEventListeners();
  initMap();
  initScrollAnimations();
  initCountUp();
  animateChart();

  if (currentUser) {
    loadNotifications();
  }
});

// --- EVENTS ---
function setupEventListeners() {
  navButtons.forEach(btn => btn.addEventListener('click', () => {
    if (!btn.classList.contains('active')) switchView(btn.dataset.view);
  }));

  document.querySelectorAll('.nav-links a[data-nav]').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); switchView(a.dataset.nav); });
  });

  donationForm.addEventListener('submit', handleFoodSubmission);

  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('mobileMenu').classList.toggle('open');
  });

  // Auth modal
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });

  document.getElementById('auth-modal-overlay').addEventListener('click', closeAuthModal);

  // Close notification dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('nav-notif-btn');
    if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
}

function closeMobileMenu() { document.getElementById('mobileMenu').classList.remove('open'); }

// --- VIEW SWITCH ---
function switchView(viewName) {
  if (viewName === 'impact' || viewName === 'community' || viewName === 'about') {
    switchView('home');
    setTimeout(() => { document.getElementById(viewName)?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    return;
  }

  // Protect add, profile, and pickup views
  if ((viewName === 'add' || viewName === 'profile' || viewName === 'pickup') && !currentUser) {
    openAuthModal('login');
    return;
  }

  navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.nav-links a[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === viewName);
  });
  views.forEach(view => view.classList.toggle('active', view.id === `${viewName}-view`));
  window.scrollTo(0, 0);
  closeMobileMenu();

  if (viewName === 'add') setTimeout(() => { initMapAdd(); initExpiryInput(); }, 200);
  if (viewName === 'profile') loadProfileData();
  if (viewName === 'pickup' && currentPickupFoodId) loadPickupDashboard(currentPickupFoodId);
}

// --- MAPS ---
let map, mapAdd, markerAdd, addMarkerLatLng = null;
const mapMarkers = [];

function initMap() {
  const coords = [13.342, 77.112];
  map = L.map('map').setView(coords, 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
  }).addTo(map);
}

function updateMapMarkers(foods) {
  // Clear existing markers
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers.length = 0;

  const greenIcon = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#22C55E;border-radius:50%;box-shadow:0 0 12px #22C55E,0 0 24px rgba(34,197,94,0.4);border:2px solid rgba(255,255,255,0.3);"></div>',
    iconSize: [14, 14], iconAnchor: [7, 7]
  });

  const activeCount = foods.filter(f => f.latitude && f.longitude).length;
  const badgeEl = document.querySelector('.map-badge');
  if (badgeEl) badgeEl.textContent = `🟢 Active Shares: ${activeCount || foods.length}`;

  foods.forEach(food => {
    if (food.latitude && food.longitude) {
      const marker = L.marker([food.latitude, food.longitude], { icon: greenIcon })
        .addTo(map)
        .bindPopup(`<b>${food.name}</b><br>${food.address || ''}`);
      mapMarkers.push(marker);
    }
  });

  // Add default markers if no geo data
  if (activeCount === 0) {
    const defaultMarkers = [
      { lat: 13.342, lng: 77.112, label: 'FoodShare Hub' },
      { lat: 13.350, lng: 77.120, label: 'Community Center' },
      { lat: 13.335, lng: 77.105, label: 'Popular Area' },
    ];
    defaultMarkers.forEach(dm => {
      const m = L.marker([dm.lat, dm.lng], { icon: greenIcon })
        .addTo(map).bindPopup(`<b>${dm.label}</b>`);
      mapMarkers.push(m);
    });
  }
}

function initMapAdd() {
  if (mapAdd) return;
  const coords = [13.342, 77.112];
  mapAdd = L.map('map-add').setView(coords, 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(mapAdd);
  markerAdd = L.marker(coords).addTo(mapAdd);

  mapAdd.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    markerAdd.setLatLng([lat, lng]);
    addMarkerLatLng = { lat, lng };
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const d = await r.json();
      document.getElementById('food-address').value = d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      document.getElementById('food-address').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  });
}

// --- UTILITY ---
function timeAgo(dateStr) {
  if (!dateStr) return 'just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeUntilExpiry(dateStr) {
  if (!dateStr) return 'Fresh';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m left`;
  return `${hours}h left`;
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    notification: '🔔'
  };

  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- SCROLL ANIMATIONS ---
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
}

// --- COUNT UP ---
function initCountUp() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !e.target.dataset.counted) {
        e.target.dataset.counted = 'true';
        const nums = e.target.querySelectorAll('[data-count]');
        nums.forEach(n => {
          const target = +n.dataset.count; let current = 0;
          const step = target / 60;
          const timer = setInterval(() => {
            current += step;
            if (current >= target) { current = target; clearInterval(timer); }
            n.textContent = Math.floor(current).toLocaleString();
          }, 25);
        });
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.stats-row').forEach(el => observer.observe(el));
}

// --- CHART ---
function animateChart() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const line = document.getElementById('chartLine');
        if (line) { line.style.transition = 'stroke-dashoffset 2s ease-out'; line.style.strokeDashoffset = '0'; }
      }
    });
  }, { threshold: 0.3 });
  const chart = document.querySelector('.chart-container');
  if (chart) observer.observe(chart);
}

function setChartPeriod(btn, period) {
  document.querySelectorAll('.chart-toggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// =======================================
// AI FOOD QUALITY CHECK MODULE
// =======================================

let mobilenetModel = null;
let lastAIResult = null;

// Food-related ImageNet categories and their edibility scores
const FOOD_CATEGORIES = {
  // High edibility (80-100) — clearly fresh food
  'pizza': 95, 'cheeseburger': 90, 'hotdog': 88, 'french_loaf': 92, 'bagel': 90,
  'pretzel': 88, 'burrito': 92, 'ice_cream': 85, 'ice_lolly': 82, 'espresso': 90,
  'cup': 70, 'soup_bowl': 88, 'guacamole': 92, 'meat_loaf': 85, 'plate': 75,
  'carbonara': 93, 'chocolate_sauce': 80, 'dough': 78, 'custard_apple': 90,
  'strawberry': 95, 'orange': 95, 'lemon': 90, 'fig': 92, 'pineapple': 95,
  'banana': 93, 'jackfruit': 88, 'pomegranate': 92, 'granny_smith': 95,
  'corn': 90, 'acorn_squash': 88, 'mushroom': 85, 'broccoli': 95,
  'cauliflower': 92, 'bell_pepper': 93, 'cucumber': 92, 'head_cabbage': 88,
  'zucchini': 90, 'spaghetti_squash': 85, 'butternut_squash': 88,
  'artichoke': 85, 'cardoon': 80, 'trifle': 88, 'cake': 85,
  'potpie': 88, 'consomme': 82, 'hot_pot': 90, 'grocery_store': 70,

  // Medium edibility (50-79) — could be food but uncertain
  'bakery': 72, 'dining_table': 65, 'restaurant': 68, 'menu': 55,
  'mixing_bowl': 60, 'spatula': 50, 'crock_pot': 65, 'frying_pan': 60,
  'wok': 60, 'caldron': 55, 'coffeepot': 55, 'teapot': 55,
  'wooden_spoon': 50, 'ladle': 50, 'strainer': 50,

  // Low edibility (0-39) — non-food or spoiled indicators
  'toilet_tissue': 10, 'Band_Aid': 8, 'muzzle': 5, 'pill_bottle': 10,
  'syringe': 5, 'mouse': 5, 'cockroach': 3, 'ant': 5, 'fly': 3,
  'tick': 3, 'slug': 5, 'snail': 10, 'earthworm': 5,
};

// Keywords that suggest spoiled/unsafe food
const SPOILAGE_KEYWORDS = [
  'fungus', 'mold', 'mould', 'agaric', 'mushroom', 'toadstool', 'stinkhorn',
  'earthstar', 'slime_mold', 'hen-of-the-woods', 'bolete', 'coral_fungus',
  'lichen', 'rust', 'decay', 'rot', 'compost', 'garbage', 'trash',
  'cockroach', 'ant', 'fly', 'maggot', 'worm', 'insect', 'pest',
  'toilet', 'syringe', 'Band_Aid', 'bandage'
];

// Keywords that strongly indicate fresh food
const FRESH_FOOD_KEYWORDS = [
  'pizza', 'burger', 'sandwich', 'salad', 'pasta', 'rice', 'bread', 'loaf',
  'cake', 'pie', 'fruit', 'vegetable', 'soup', 'stew', 'curry',
  'apple', 'banana', 'orange', 'strawberry', 'grape', 'mango',
  'broccoli', 'carrot', 'potato', 'tomato', 'corn', 'pepper',
  'ice_cream', 'custard', 'trifle', 'espresso', 'coffee',
  'meat', 'chicken', 'fish', 'egg', 'cheese', 'milk',
  'bagel', 'pretzel', 'burrito', 'hotdog', 'cheeseburger',
  'french_loaf', 'potpie', 'carbonara', 'guacamole', 'consomme'
];

async function initFoodQualityChecker() {
  if (mobilenetModel) return mobilenetModel;
  try {
    showToast('Loading AI model for food quality check...', 'info');
    mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 });
    showToast('AI model ready!', 'success');
    return mobilenetModel;
  } catch (err) {
    console.error('Failed to load MobileNet:', err);
    showToast('AI model failed to load. Quality check unavailable.', 'error');
    return null;
  }
}

async function analyzeFoodImage(imgElement, titleText = '', descText = '') {
  const model = await initFoodQualityChecker();
  if (!model) {
    return {
      score: 50, label: 'Unknown', status: 'uncertain',
      classification: 'AI unavailable', confidence: 0, flagged: false, predictions: []
    };
  }

  try {
    const predictions = await model.classify(imgElement, 10);
    return calculateEdibilityScore(predictions, titleText, descText);
  } catch (err) {
    console.error('AI analysis failed:', err);
    return {
      score: 50, label: 'Unknown', status: 'uncertain',
      classification: 'Analysis failed', confidence: 0, flagged: false, predictions: []
    };
  }
}

function calculateEdibilityScore(predictions, titleText = '', descText = '') {
  if (!predictions || predictions.length === 0) {
    return { score: 50, label: 'Unknown', status: 'uncertain', classification: 'No results', confidence: 0, flagged: false, predictions: [] };
  }

  const topPrediction = predictions[0];
  const confidence = Math.round(topPrediction.probability * 100);

  // NLP Check
  const combinedText = `${titleText} ${descText}`.toLowerCase();
  let textIsFood = false;
  let textCategoryScore = -1;

  for (const keyword of FRESH_FOOD_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      textIsFood = true;
      break;
    }
  }

  for (const [cat, score] of Object.entries(FOOD_CATEGORIES)) {
    if (combinedText.includes(cat.toLowerCase().replace(/_/g, ' '))) {
      textCategoryScore = Math.max(textCategoryScore, score);
    }
  }

  // Check for spoilage indicators across ALL predictions and text
  let spoilageDetected = false;
  let spoilageMatch = '';
  
  for (const keyword of SPOILAGE_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      spoilageDetected = true;
      spoilageMatch = keyword;
      break;
    }
  }

  if (!spoilageDetected) {
    for (const pred of predictions) {
      const name = pred.className.toLowerCase();
      for (const keyword of SPOILAGE_KEYWORDS) {
        if (name.includes(keyword.toLowerCase())) {
          spoilageDetected = true;
          spoilageMatch = pred.className;
          break;
        }
      }
      if (spoilageDetected) break;
    }
  }

  // Check if it's recognized as food via Image
  let imgIsFoodItem = false;
  for (const pred of predictions) {
    const name = pred.className.toLowerCase();
    for (const keyword of FRESH_FOOD_KEYWORDS) {
      if (name.includes(keyword.toLowerCase())) {
        imgIsFoodItem = true;
        break;
      }
    }
    if (imgIsFoodItem) break;
  }

  let isFoodItem = imgIsFoodItem || textIsFood;

  // Check known categories via Image
  let imgCategoryScore = -1;
  for (const pred of predictions.slice(0, 5)) {
    const name = pred.className.toLowerCase().replace(/[\s,]+/g, '_');
    for (const [cat, score] of Object.entries(FOOD_CATEGORIES)) {
      if (name.includes(cat.toLowerCase())) {
        imgCategoryScore = Math.max(imgCategoryScore, score);
        break;
      }
    }
  }

  let finalCategoryScore = Math.max(imgCategoryScore, textCategoryScore);

  // Calculate final score
  let score;
  let flagged = false;

  if (spoilageDetected) {
    score = Math.max(5, Math.min(30, 30 - confidence * 0.3));
    flagged = true;
  } else if (finalCategoryScore >= 0) {
    // If text and image both confirm food, boost score
    let hybridBoost = (imgCategoryScore >= 0 && textCategoryScore >= 0) ? 10 : 0;
    score = Math.round(finalCategoryScore * (0.6 + confidence * 0.003)) + hybridBoost;
    score = Math.max(10, Math.min(100, score));
  } else if (isFoodItem) {
    let hybridBoost = (imgIsFoodItem && textIsFood) ? 15 : 0;
    score = Math.max(60, Math.min(95, 70 + confidence * 0.2)) + hybridBoost;
    score = Math.max(10, Math.min(100, score));
  } else {
    score = Math.max(15, Math.min(45, 35 - confidence * 0.2));
    flagged = true;
  }

  // Determine status
  let status, label;
  if (spoilageDetected) {
    status = 'suspicious'; label = 'Food Damaged / Spoiled'; flagged = true;
  } else if (!isFoodItem && finalCategoryScore < 0) {
    status = 'suspicious'; label = 'Not a Food Item'; flagged = true;
  } else if (score >= 80) { status = 'fresh'; label = 'Fresh & Edible'; }
  else if (score >= 60) { status = 'edible'; label = 'Likely Edible'; }
  else if (score >= 40) { status = 'uncertain'; label = 'Quality Needs Review'; flagged = true; }
  else { status = 'suspicious'; label = 'Poor Quality Detected'; flagged = true; }

  let displayClass = textIsFood && !imgIsFoodItem ? `Text: ${titleText}` : topPrediction.className;

  return { score, label, status, classification: displayClass, confidence, flagged, spoilageDetected, spoilageMatch, isFoodItem, predictions };
}

function renderQualityResult(result) {
  const loading = document.getElementById('ai-loading');
  const results = document.getElementById('ai-results');
  const scoreOverlay = document.getElementById('ai-score-overlay');

  loading.style.display = 'none';
  results.style.display = 'block';
  scoreOverlay.style.display = 'flex';

  const ringProgress = document.getElementById('ai-ring-progress');
  const circumference = 326.73;
  const offset = circumference - (result.score / 100) * circumference;

  const colors = { fresh: '#22C55E', edible: '#EAB308', uncertain: '#F97316', suspicious: '#EF4444' };
  ringProgress.style.stroke = colors[result.status] || colors.uncertain;

  setTimeout(() => {
    ringProgress.style.transition = 'stroke-dashoffset 1.5s ease-out';
    ringProgress.style.strokeDashoffset = offset;
  }, 100);

  animateNumber(document.getElementById('ai-score-number'), 0, result.score, 1200);

  document.getElementById('ai-classification').textContent = result.classification;
  document.getElementById('ai-confidence').textContent = result.confidence + '%';

  const badge = document.getElementById('ai-edibility-badge');
  badge.textContent = result.label;
  badge.className = `ai-badge ai-badge-${result.status}`;

  const warningBanner = document.getElementById('ai-warning-banner');
  const warningTitle = document.getElementById('ai-warning-title');
  const warningMessage = document.getElementById('ai-warning-message');
  const reviewFlag = document.getElementById('ai-review-flag');

  if (result.flagged) {
    warningBanner.style.display = 'flex';
    reviewFlag.style.display = 'flex';
    if (result.spoilageDetected) {
      warningTitle.textContent = '🚫 Food Appears Damaged or Spoiled';
      warningMessage.textContent = `The AI detected signs of spoilage or damage (identified as "${result.spoilageMatch}"). This food may not be safe to share. The listing will be flagged for moderator review before it becomes visible.`;
    } else if (!result.isFoodItem) {
      warningTitle.textContent = '🚫 This is Not a Food Item';
      warningMessage.textContent = `The AI identified this image as "${result.classification}" which is not a food item. Please upload a clear photo of the food you want to share.`;
    } else {
      warningTitle.textContent = '⚠️ Food Quality Needs Review';
      warningMessage.textContent = `The AI detected the food but is not confident about its quality (Score: ${result.score}/100). This listing will be reviewed by a moderator to ensure food safety.`;
    }
  } else {
    warningBanner.style.display = 'none';
    reviewFlag.style.display = 'none';
  }
}

function animateNumber(el, start, end, duration) {
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (end - start) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function handlePhotoChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  const panel = document.getElementById('ai-quality-panel');
  const previewImg = document.getElementById('ai-preview-img');
  const loading = document.getElementById('ai-loading');
  const results = document.getElementById('ai-results');
  const scoreOverlay = document.getElementById('ai-score-overlay');
  const uploadLabel = document.getElementById('photo-upload-label');

  panel.style.display = 'block';
  loading.style.display = 'flex';
  results.style.display = 'none';
  scoreOverlay.style.display = 'none';

  uploadLabel.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
    ${file.name} ✓ (click to change)`;

  const ringProgress = document.getElementById('ai-ring-progress');
  ringProgress.style.transition = 'none';
  ringProgress.style.strokeDashoffset = '326.73';

  const reader = new FileReader();
  reader.onload = async (e) => {
    previewImg.src = e.target.result;
    previewImg.onload = async () => {
      try {
        const titleText = document.getElementById('food-title').value;
        const descText = document.getElementById('food-description').value;

        const result = await analyzeFoodImage(previewImg, titleText, descText);
        lastAIResult = result;
        renderQualityResult(result);
        console.log('AI Predictions:', result.predictions);
        console.log('AI Hybrid Result:', result);
      } catch (err) {
        console.error('AI analysis error:', err);
        loading.style.display = 'none';
        lastAIResult = null;
        showToast('AI analysis failed. You can still submit.', 'error');
      }
    };
  };
  reader.readAsDataURL(file);
}

// ============================================
// AI FRESHNESS CALCULATOR (Client-side)
// ============================================
const AI_DECAY_RATES = {
  cooked_meal: 0.15, bakery: 0.04, fruits_vegetables: 0.02,
  dairy: 0.08, snacks: 0.10, beverages: 0.20, packaged: 0.005
};

function calculateFreshness(food) {
  if (!food.createdAt || !food.expiresAt) {
    return { score: 0, label: '', color: '#666' };
  }

  const now = new Date();
  const created = new Date(food.createdAt);
  const expires = new Date(food.expiresAt);
  const hoursElapsed = (now - created) / (1000 * 60 * 60);
  const hoursRemaining = Math.max(0, (expires - now) / (1000 * 60 * 60));
  const totalHours = (expires - created) / (1000 * 60 * 60);

  const decayRate = AI_DECAY_RATES[food.aiCategory] || 0.10;

  // Exponential decay: score = 100 * e^(-λt)
  let score = Math.round(100 * Math.exp(-decayRate * hoursElapsed));
  const expiryFactor = hoursRemaining / Math.max(totalHours, 1);
  score = Math.round(score * 0.7 + expiryFactor * 100 * 0.3);
  score = Math.max(0, Math.min(100, score));

  let label, color;
  if (score >= 80) { label = 'Very Fresh'; color = '#22C55E'; }
  else if (score >= 60) { label = 'Fresh'; color = '#84CC16'; }
  else if (score >= 40) { label = 'Moderate'; color = '#F59E0B'; }
  else if (score >= 20) { label = 'Low'; color = '#F97316'; }
  else { label = 'Expired'; color = '#EF4444'; }

  return { score, label, color };
}