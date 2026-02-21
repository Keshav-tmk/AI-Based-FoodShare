const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Food = require('../models/Food');
const Notification = require('../models/Notification');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  }
});

// GET /api/food — List all available food
router.get('/', async (req, res) => {
  try {
    const foods = await Food.find({ status: { $ne: 'completed' } })
      .populate('donor', 'name email avatar')
      .populate('claimedBy', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json(foods);
  } catch (err) {
    console.error('Get food error:', err);
    res.status(500).json({ message: 'Failed to load food listings' });
  }
});

// POST /api/food — Create food listing (auth required)
router.post('/', auth, upload.single('photo'), async (req, res) => {
  try {
    const { name, description, address, latitude, longitude } = req.body;

    if (!name || !address) {
      return res.status(400).json({ message: 'Food name and address are required' });
    }

    const foodData = {
      name,
      description: description || '',
      address,
      donor: req.user._id,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null
    };

    if (req.file) {
      foodData.photo = `/uploads/${req.file.filename}`;
    }

    const food = new Food(foodData);
    await food.save();

    // Populate donor info before returning
    await food.populate('donor', 'name email avatar');

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('food_shared', { food });
    }

    res.status(201).json(food);
  } catch (err) {
    console.error('Create food error:', err);
    res.status(500).json({ message: 'Failed to create food listing' });
  }
});

// POST /api/food/:id/claim — Claim a food item (auth required)
router.post('/:id/claim', auth, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id).populate('donor', 'name email avatar');

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.status !== 'available') {
      return res.status(400).json({ message: 'This food has already been claimed' });
    }

    if (food.donor._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot claim your own food listing' });
    }

    food.status = 'claimed';
    food.claimedBy = req.user._id;
    await food.save();

    // Create notification for the donor
    const notification = new Notification({
      user: food.donor._id,
      message: `${req.user.name} claimed your "${food.name}" listing!`
    });
    await notification.save();

    // Send real-time notification to donor
    const io = req.app.get('io');
    if (io) {
      io.to(food.donor._id.toString()).emit('notification', {
        message: notification.message
      });
    }

    res.json({ message: 'Food claimed successfully!' });
  } catch (err) {
    console.error('Claim food error:', err);
    res.status(500).json({ message: 'Failed to claim food' });
  }
});

// PUT /api/food/:id/complete — Mark as picked up (auth, donor only)
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.donor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the donor can mark this as completed' });
    }

    if (food.status !== 'claimed') {
      return res.status(400).json({ message: 'This food must be claimed first' });
    }

    food.status = 'completed';
    await food.save();

    // Notify the claimer
    if (food.claimedBy) {
      const notification = new Notification({
        user: food.claimedBy,
        message: `Your pickup of "${food.name}" has been confirmed by the donor!`
      });
      await notification.save();

      const io = req.app.get('io');
      if (io) {
        io.to(food.claimedBy.toString()).emit('notification', {
          message: notification.message
        });
      }
    }

    res.json({ message: 'Pickup marked as completed!' });
  } catch (err) {
    console.error('Complete food error:', err);
    res.status(500).json({ message: 'Failed to complete food listing' });
  }
});

// DELETE /api/food/:id — Delete listing (auth, donor only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.donor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own listings' });
    }

    // Delete photo file if it exists
    if (food.photo) {
      const photoPath = path.join(__dirname, '..', food.photo);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    await Food.findByIdAndDelete(req.params.id);

    res.json({ message: 'Food listing deleted' });
  } catch (err) {
    console.error('Delete food error:', err);
    res.status(500).json({ message: 'Failed to delete food listing' });
  }
});

module.exports = router;
