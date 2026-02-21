const express = require('express');
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');
const router = express.Router();

// GET /api/notifications — Get user notifications
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ message: 'Failed to load notifications' });
  }
});

// PUT /api/notifications/read-all — Mark all as read
router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true } }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ message: 'Failed to update notifications' });
  }
});

module.exports = router;
