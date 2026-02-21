const express = require('express');
const auth = require('../middleware/auth');
const Food = require('../models/Food');
const router = express.Router();

// GET /api/users/stats — User stats
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const [foodShared, foodClaimed, totalCompleted] = await Promise.all([
      Food.countDocuments({ donor: userId }),
      Food.countDocuments({ claimedBy: userId }),
      Food.countDocuments({
        $or: [
          { donor: userId, status: 'completed' },
          { claimedBy: userId, status: 'completed' }
        ]
      })
    ]);

    res.json({ foodShared, foodClaimed, totalCompleted });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

// GET /api/users/my-food — User's own food listings
router.get('/my-food', auth, async (req, res) => {
  try {
    const foods = await Food.find({ donor: req.user._id })
      .populate('donor', 'name email avatar')
      .populate('claimedBy', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json(foods);
  } catch (err) {
    console.error('My food error:', err);
    res.status(500).json({ message: 'Failed to load your food listings' });
  }
});

// GET /api/users/my-claims — Food claimed by user
router.get('/my-claims', auth, async (req, res) => {
  try {
    const foods = await Food.find({ claimedBy: req.user._id })
      .populate('donor', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json(foods);
  } catch (err) {
    console.error('My claims error:', err);
    res.status(500).json({ message: 'Failed to load your claimed food' });
  }
});

module.exports = router;
