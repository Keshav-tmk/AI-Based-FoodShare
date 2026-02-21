const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Food = require('../models/Food');
const Notification = require('../models/Notification');
const { classifyFood } = require('../ml/foodAI');
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

// Generate 4-digit OTP
function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

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

// GET /api/food/:id/pickup — Get pickup dashboard data (receiver only)
router.get('/:id/pickup', auth, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id)
      .populate('donor', 'name email avatar')
      .populate('claimedBy', 'name email avatar');

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.status !== 'claimed') {
      return res.status(400).json({ message: 'This food is not currently claimed' });
    }

    // Only the claimer can view the pickup dashboard
    if (!food.claimedBy || food.claimedBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the claimer can view pickup details' });
    }

    res.json({
      food: {
        _id: food._id,
        name: food.name,
        description: food.description,
        photo: food.photo,
        address: food.address,
        latitude: food.latitude,
        longitude: food.longitude,
        status: food.status,
        pickupOtp: food.pickupOtp,
        claimedAt: food.claimedAt,
        expiresAt: food.expiresAt,
        createdAt: food.createdAt
      },
      donor: food.donor
    });
  } catch (err) {
    console.error('Pickup data error:', err);
    res.status(500).json({ message: 'Failed to load pickup data' });
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

    // Custom expiry time from user
    if (req.body.expiresAt) {
      const expiryDate = new Date(req.body.expiresAt);
      if (expiryDate > new Date()) {
        foodData.expiresAt = expiryDate;
      }
    }

    if (req.file) {
      foodData.photo = `/uploads/${req.file.filename}`;
    }

    // AI Auto-Classification
    const aiResult = classifyFood(name, description || '');
    foodData.aiCategory = aiResult.category;
    foodData.aiCategoryLabel = aiResult.categoryLabel;
    foodData.aiEmoji = aiResult.emoji;
    foodData.aiConfidence = aiResult.confidence;
    foodData.aiShelfLifeHours = aiResult.shelfLifeHours;

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

    // Check if food has expired
    if (food.expiresAt && new Date(food.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This food listing has expired and can no longer be claimed' });
    }

    if (food.donor._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot claim your own food listing' });
    }

    // Generate pickup OTP
    const otp = generateOtp();

    food.status = 'claimed';
    food.claimedBy = req.user._id;
    food.pickupOtp = otp;
    food.claimedAt = new Date();
    await food.save();

    // Create notification for the donor with OTP info
    const notification = new Notification({
      user: food.donor._id,
      message: `${req.user.name} claimed your "${food.name}"! Pickup OTP: ${otp}`
    });
    await notification.save();

    // Send real-time notification to donor
    const io = req.app.get('io');
    if (io) {
      // Standard notification
      io.to(food.donor._id.toString()).emit('notification', {
        message: notification.message
      });

      // Rich claim alert for donor (full-screen popup)
      io.to(food.donor._id.toString()).emit('claim_alert', {
        foodId: food._id,
        foodName: food.name,
        foodPhoto: food.photo,
        address: food.address,
        latitude: food.latitude,
        longitude: food.longitude,
        pickupOtp: otp,
        receiver: {
          name: req.user.name,
          avatar: req.user.avatar,
          email: req.user.email
        }
      });
    }

    // Return full data for the pickup dashboard
    res.json({
      message: 'Food claimed successfully!',
      pickupData: {
        foodId: food._id,
        name: food.name,
        description: food.description,
        photo: food.photo,
        address: food.address,
        latitude: food.latitude,
        longitude: food.longitude,
        pickupOtp: otp,
        claimedAt: food.claimedAt,
        expiresAt: food.expiresAt,
        donor: food.donor
      }
    });
  } catch (err) {
    console.error('Claim food error:', err);
    res.status(500).json({ message: 'Failed to claim food' });
  }
});

// POST /api/food/:id/cancel-claim — Cancel a claim (claimer only)
router.post('/:id/cancel-claim', auth, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id).populate('donor', 'name email avatar');

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.status !== 'claimed') {
      return res.status(400).json({ message: 'This food is not currently claimed' });
    }

    if (!food.claimedBy || food.claimedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the claimer can cancel this claim' });
    }

    food.status = 'available';
    food.claimedBy = null;
    food.pickupOtp = null;
    food.claimedAt = null;
    await food.save();

    // Notify donor
    const notification = new Notification({
      user: food.donor._id,
      message: `${req.user.name} cancelled their claim on "${food.name}". It's available again.`
    });
    await notification.save();

    const io = req.app.get('io');
    if (io) {
      io.to(food.donor._id.toString()).emit('notification', {
        message: notification.message
      });
      io.emit('food_shared', { food });
    }

    res.json({ message: 'Claim cancelled. Food is available again.' });
  } catch (err) {
    console.error('Cancel claim error:', err);
    res.status(500).json({ message: 'Failed to cancel claim' });
  }
});

// PUT /api/food/:id/complete — Mark as picked up with OTP verification (donor or receiver)
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    // Allow both donor and receiver (claimer) to verify OTP
    const isDonor = food.donor.toString() === req.user._id.toString();
    const isClaimer = food.claimedBy && food.claimedBy.toString() === req.user._id.toString();

    if (!isDonor && !isClaimer) {
      return res.status(403).json({ message: 'Only the donor or receiver can complete this pickup' });
    }

    if (food.status !== 'claimed') {
      return res.status(400).json({ message: 'This food must be claimed first' });
    }

    // Verify OTP
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: 'Please enter the pickup OTP' });
    }

    if (otp !== food.pickupOtp) {
      return res.status(400).json({ message: 'Invalid OTP. Please check the code from the receiver.' });
    }

    food.status = 'completed';
    food.pickupOtp = null; // Clear OTP after use
    await food.save();

    const io = req.app.get('io');

    // Notify the claimer
    if (food.claimedBy) {
      const notification = new Notification({
        user: food.claimedBy,
        message: `Your pickup of "${food.name}" has been confirmed! Thank you for reducing food waste! 🎉`
      });
      await notification.save();

      if (io) {
        io.to(food.claimedBy.toString()).emit('notification', {
          message: notification.message
        });
      }
    }

    // Emit pickup_completed to donor, receiver, and food room
    if (io) {
      const donorId = food.donor.toString();
      let claimerId = food.claimedBy ? food.claimedBy.toString() : '';
      
      io.to(donorId).emit('pickup_completed', { foodId: food._id });
      if (claimerId) {
         io.to(claimerId).emit('pickup_completed', { foodId: food._id });
      }
      io.to('food_' + food._id.toString()).emit('pickup_completed', { foodId: food._id });
    }

    res.json({ message: 'Pickup verified and completed! 🎉' });
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
