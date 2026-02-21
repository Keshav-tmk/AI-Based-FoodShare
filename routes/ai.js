const express = require('express');
const auth = require('../middleware/auth');
const Food = require('../models/Food');
const { classifyFood, predictFreshness, getRecommendations, predictDemand } = require('../ml/foodAI');
const router = express.Router();

// GET /api/ai/classify?name=...&description=...
// Classify a food item into a category
router.get('/classify', (req, res) => {
  const { name, description } = req.query;
  if (!name) {
    return res.status(400).json({ message: 'Food name is required' });
  }

  const result = classifyFood(name, description || '');
  res.json(result);
});

// GET /api/ai/freshness/:foodId
// Get AI freshness prediction for a specific food listing
router.get('/freshness/:foodId', async (req, res) => {
  try {
    const food = await Food.findById(req.params.foodId);
    if (!food) {
      return res.status(404).json({ message: 'Food not found' });
    }

    const classification = classifyFood(food.name, food.description || '');
    const freshness = predictFreshness(classification.category, food.createdAt, food.expiresAt);

    res.json({
      food: { _id: food._id, name: food.name },
      category: classification,
      freshness
    });
  } catch (err) {
    console.error('Freshness prediction error:', err);
    res.status(500).json({ message: 'Failed to predict freshness' });
  }
});

// GET /api/ai/recommendations
// Get smart food recommendations for the logged-in user
router.get('/recommendations', auth, async (req, res) => {
  try {
    // Get available foods
    const availableFoods = await Food.find({
      status: 'available',
      donor: { $ne: req.user._id }, // Exclude own listings
      expiresAt: { $gt: new Date() } // Not expired
    })
      .populate('donor', 'name avatar')
      .sort({ createdAt: -1 })
      .lean();

    // Get user's claim history
    const claimHistory = await Food.find({
      claimedBy: req.user._id
    })
      .select('name description')
      .lean();

    // User location from query params
    let userLocation = null;
    if (req.query.lat && req.query.lng) {
      userLocation = {
        lat: parseFloat(req.query.lat),
        lng: parseFloat(req.query.lng)
      };
    }

    const recommendations = getRecommendations(availableFoods, claimHistory, userLocation);

    res.json({
      recommendations: recommendations.slice(0, 20),
      totalAvailable: availableFoods.length,
      userClaimCount: claimHistory.length
    });
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({ message: 'Failed to generate recommendations' });
  }
});

// GET /api/ai/demand
// Get demand prediction insights (public)
router.get('/demand', async (req, res) => {
  try {
    const allFoods = await Food.find({})
      .select('name description createdAt')
      .lean();

    const insights = predictDemand(allFoods);
    res.json(insights);
  } catch (err) {
    console.error('Demand prediction error:', err);
    res.status(500).json({ message: 'Failed to predict demand' });
  }
});

// GET /api/ai/analyze
// Full AI analysis for a food item (name + description)
router.get('/analyze', (req, res) => {
  const { name, description } = req.query;
  if (!name) {
    return res.status(400).json({ message: 'Food name is required' });
  }

  const classification = classifyFood(name, description || '');

  // Simulate freshness for a "just listed" item
  const now = new Date();
  const expiresAt = new Date(now.getTime() + classification.shelfLifeHours * 60 * 60 * 1000);
  const freshness = predictFreshness(classification.category, now, expiresAt);

  res.json({
    classification,
    freshness,
    suggestedExpiry: expiresAt.toISOString(),
    tips: getFoodTips(classification.category)
  });
});

function getFoodTips(category) {
  const tips = {
    cooked_meal: [
      'Store in airtight containers',
      'Keep at room temperature for max 2 hours',
      'Reheat thoroughly before consuming'
    ],
    bakery: [
      'Store in a cool, dry place',
      'Wrap in cling film to prevent drying',
      'Best consumed within 24 hours'
    ],
    fruits_vegetables: [
      'Wash before consuming',
      'Store in cool areas away from sunlight',
      'Check for bruises or soft spots'
    ],
    dairy: [
      'Keep refrigerated at all times',
      'Check for sour smell before consuming',
      'Do not leave at room temperature for long'
    ],
    snacks: [
      'Check packaging for any damage',
      'Store in a dry place',
      'Best consumed fresh'
    ],
    beverages: [
      'Keep cold if possible',
      'Check for unusual color or smell',
      'Consume within a few hours of opening'
    ],
    packaged: [
      'Check expiry date on packaging',
      'Ensure seal is intact',
      'Store as per package instructions'
    ]
  };

  return tips[category] || tips['cooked_meal'];
}

module.exports = router;
