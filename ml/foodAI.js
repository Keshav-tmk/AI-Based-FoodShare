/**
 * AI-Based FoodShare — ML Engine
 * 
 * Features:
 * 1. Food Category Classification (NLP-based keyword matching)
 * 2. Freshness Score Prediction (time-decay model per category)
 * 3. Smart Recommendations (TF-IDF style + history-based collaborative filtering)
 * 4. Demand Prediction (time-series pattern analysis)
 */

// ============================================
// 1. FOOD CATEGORY CLASSIFICATION
// ============================================

const FOOD_CATEGORIES = {
  'cooked_meal': {
    keywords: ['rice', 'curry', 'biryani', 'dal', 'roti', 'chapati', 'naan', 'pasta', 'lasagna',
      'soup', 'stew', 'casserole', 'meal', 'dinner', 'lunch', 'cooked', 'homemade', 'prepared',
      'gravy', 'sabzi', 'paneer', 'chicken', 'mutton', 'fish', 'egg', 'omelette', 'pulao',
      'fried rice', 'noodles', 'manchurian', 'korma', 'masala', 'tikka', 'kebab', 'thali'],
    shelfLifeHours: 6,
    emoji: '🍛',
    freshnessDecayRate: 0.15  // 15% per hour
  },
  'bakery': {
    keywords: ['bread', 'cake', 'cookie', 'muffin', 'pastry', 'pie', 'donut', 'croissant',
      'biscuit', 'brownie', 'cupcake', 'roll', 'bun', 'toast', 'waffle', 'pancake',
      'puff', 'samosa', 'vada', 'pakora', 'baked', 'bakery'],
    shelfLifeHours: 24,
    emoji: '🍰',
    freshnessDecayRate: 0.04
  },
  'fruits_vegetables': {
    keywords: ['fruit', 'apple', 'banana', 'orange', 'mango', 'grape', 'watermelon',
      'vegetable', 'tomato', 'potato', 'onion', 'carrot', 'spinach', 'salad', 'lettuce',
      'cucumber', 'broccoli', 'cauliflower', 'fresh produce', 'organic'],
    shelfLifeHours: 48,
    emoji: '🥗',
    freshnessDecayRate: 0.02
  },
  'dairy': {
    keywords: ['milk', 'cheese', 'yogurt', 'curd', 'butter', 'cream', 'paneer', 'ghee',
      'lassi', 'buttermilk', 'ice cream', 'milkshake', 'smoothie'],
    shelfLifeHours: 12,
    emoji: '🧀',
    freshnessDecayRate: 0.08
  },
  'snacks': {
    keywords: ['chips', 'snack', 'popcorn', 'nuts', 'trail mix', 'granola', 'bar',
      'crackers', 'pretzels', 'nachos', 'fries', 'pizza', 'burger', 'sandwich',
      'wrap', 'roll', 'momos', 'chaat', 'bhel', 'pani puri', 'spring roll'],
    shelfLifeHours: 8,
    emoji: '🍿',
    freshnessDecayRate: 0.10
  },
  'beverages': {
    keywords: ['juice', 'water', 'tea', 'coffee', 'drink', 'soda', 'lemonade',
      'smoothie', 'shake', 'beverage', 'chai'],
    shelfLifeHours: 4,
    emoji: '🥤',
    freshnessDecayRate: 0.20
  },
  'packaged': {
    keywords: ['canned', 'packaged', 'sealed', 'packet', 'box', 'container', 'jar',
      'tin', 'preserved', 'dry', 'instant', 'ready to eat', 'frozen'],
    shelfLifeHours: 168, // 7 days
    emoji: '📦',
    freshnessDecayRate: 0.005
  }
};

/**
 * Classify food into a category using keyword matching + scoring
 * @param {string} name - Food name
 * @param {string} description - Food description
 * @returns {object} { category, confidence, emoji, shelfLifeHours }
 */
function classifyFood(name, description = '') {
  const text = `${name} ${description}`.toLowerCase();
  const words = text.split(/\s+/);

  let bestCategory = 'cooked_meal'; // default
  let bestScore = 0;

  for (const [category, data] of Object.entries(FOOD_CATEGORIES)) {
    let score = 0;
    for (const keyword of data.keywords) {
      if (text.includes(keyword)) {
        // Exact match in name gets higher score
        if (name.toLowerCase().includes(keyword)) {
          score += 3;
        } else {
          score += 1;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  const confidence = Math.min(bestScore / 5, 1.0); // Normalize to 0-1
  const catInfo = FOOD_CATEGORIES[bestCategory];

  return {
    category: bestCategory,
    categoryLabel: bestCategory.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    confidence: Math.round(confidence * 100),
    emoji: catInfo.emoji,
    shelfLifeHours: catInfo.shelfLifeHours,
    freshnessDecayRate: catInfo.freshnessDecayRate
  };
}


// ============================================
// 2. FRESHNESS SCORE PREDICTION
// ============================================

/**
 * Calculate AI freshness score (0-100) based on category and time elapsed
 * Uses exponential decay model: score = 100 * e^(-decay_rate * hours_elapsed)
 * 
 * @param {string} category - Food category
 * @param {Date} createdAt - When food was listed
 * @param {Date} expiresAt - When food expires
 * @returns {object} { score, label, color, hoursRemaining, recommendation }
 */
function predictFreshness(category, createdAt, expiresAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const expires = new Date(expiresAt);

  const hoursElapsed = (now - created) / (1000 * 60 * 60);
  const hoursRemaining = Math.max(0, (expires - now) / (1000 * 60 * 60));
  const totalHours = (expires - created) / (1000 * 60 * 60);

  const catInfo = FOOD_CATEGORIES[category] || FOOD_CATEGORIES['cooked_meal'];
  const decayRate = catInfo.freshnessDecayRate;

  // Exponential decay: score = 100 * e^(-λt)
  let score = Math.round(100 * Math.exp(-decayRate * hoursElapsed));

  // Also factor in how close to expiry
  const expiryFactor = hoursRemaining / Math.max(totalHours, 1);
  score = Math.round(score * 0.7 + expiryFactor * 100 * 0.3);

  score = Math.max(0, Math.min(100, score));

  let label, color, recommendation;
  if (score >= 80) {
    label = 'Very Fresh';
    color = '#22C55E';
    recommendation = 'Excellent condition — safe to consume immediately';
  } else if (score >= 60) {
    label = 'Fresh';
    color = '#84CC16';
    recommendation = 'Good condition — consume within a few hours';
  } else if (score >= 40) {
    label = 'Moderate';
    color = '#F59E0B';
    recommendation = 'Acceptable — inspect before consuming, consume soon';
  } else if (score >= 20) {
    label = 'Low';
    color = '#F97316';
    recommendation = 'Consume immediately or discard — check smell and appearance';
  } else {
    label = 'Expired';
    color = '#EF4444';
    recommendation = 'Not recommended for consumption — please discard safely';
  }

  return {
    score,
    label,
    color,
    hoursRemaining: Math.round(hoursRemaining * 10) / 10,
    hoursElapsed: Math.round(hoursElapsed * 10) / 10,
    recommendation,
    decayModel: `Exponential decay (λ=${decayRate})`
  };
}


// ============================================
// 3. SMART FOOD RECOMMENDATIONS
// ============================================

/**
 * Generate smart recommendations using TF-IDF style scoring + user history
 * 
 * @param {Array} availableFoods - List of available food items
 * @param {Array} userClaimHistory - Items previously claimed by this user
 * @param {object} userLocation - { lat, lng } of the user (optional)
 * @returns {Array} Sorted recommendations with scores
 */
function getRecommendations(availableFoods, userClaimHistory = [], userLocation = null) {
  if (availableFoods.length === 0) return [];

  // Build user preference profile from history
  const userPreferences = buildUserProfile(userClaimHistory);

  const scored = availableFoods.map(food => {
    let score = 50; // Base score

    // 1. Category preference (from claim history)
    const classification = classifyFood(food.name, food.description);
    if (userPreferences.preferredCategories.includes(classification.category)) {
      score += 20;
    }

    // 2. Freshness boost — fresher food scores higher
    const freshness = predictFreshness(
      classification.category,
      food.createdAt,
      food.expiresAt
    );
    score += freshness.score * 0.2; // Max +20

    // 3. Recency boost — newer listings score higher
    const hoursAgo = (Date.now() - new Date(food.createdAt)) / (1000 * 60 * 60);
    if (hoursAgo < 1) score += 15;
    else if (hoursAgo < 3) score += 10;
    else if (hoursAgo < 6) score += 5;

    // 4. Distance boost (if user location available)
    if (userLocation && food.latitude && food.longitude) {
      const distance = haversineDistance(
        userLocation.lat, userLocation.lng,
        food.latitude, food.longitude
      );
      if (distance < 2) score += 15;       // < 2km
      else if (distance < 5) score += 10;  // < 5km
      else if (distance < 10) score += 5;  // < 10km
    }

    // 5. Keyword similarity with past claims
    if (userClaimHistory.length > 0) {
      const similarity = textSimilarity(
        `${food.name} ${food.description}`,
        userClaimHistory.map(h => `${h.name} ${h.description || ''}`).join(' ')
      );
      score += similarity * 15; // Max +15
    }

    // 6. Photo boost — items with photos are more appealing
    if (food.photo) score += 5;

    return {
      food,
      score: Math.round(Math.min(100, score)),
      category: classification,
      freshness,
      reason: generateRecommendationReason(score, classification, freshness, hoursAgo)
    };
  });

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Build user preference profile from claim history
 */
function buildUserProfile(claimHistory) {
  const categoryCounts = {};

  claimHistory.forEach(item => {
    const cat = classifyFood(item.name, item.description || '');
    categoryCounts[cat.category] = (categoryCounts[cat.category] || 0) + 1;
  });

  // Sort by frequency
  const sorted = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  return {
    preferredCategories: sorted.slice(0, 3), // Top 3 preferred
    totalClaims: claimHistory.length
  };
}

/**
 * Simple text similarity using Jaccard index
 */
function textSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Haversine distance between two coordinates (in km)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Generate human-readable recommendation reason
 */
function generateRecommendationReason(score, classification, freshness, hoursAgo) {
  const reasons = [];

  if (freshness.score >= 80) reasons.push('🟢 Very fresh');
  else if (freshness.score >= 60) reasons.push('🟡 Still fresh');

  if (hoursAgo < 1) reasons.push('⚡ Just listed');
  else if (hoursAgo < 3) reasons.push('🕐 Listed recently');

  if (classification.confidence >= 60) {
    reasons.push(`${classification.emoji} ${classification.categoryLabel}`);
  }

  if (score >= 80) reasons.push('⭐ Top pick for you');
  else if (score >= 60) reasons.push('👍 Good match');

  return reasons.length > 0 ? reasons.join(' · ') : '📋 Available nearby';
}


// ============================================
// 4. DEMAND PREDICTION
// ============================================

/**
 * Predict demand patterns based on historical data
 * @param {Array} allFoods - All food listings (historical)
 * @returns {object} Demand insights
 */
function predictDemand(allFoods) {
  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);
  const categoryCounts = {};

  allFoods.forEach(food => {
    const date = new Date(food.createdAt);
    hourCounts[date.getHours()]++;
    dayCounts[date.getDay()]++;

    const cat = classifyFood(food.name, food.description || '');
    categoryCounts[cat.category] = (categoryCounts[cat.category] || 0) + 1;
  });

  // Peak hours
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Peak day
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const peakDay = days[dayCounts.indexOf(Math.max(...dayCounts))];

  // Top category
  const topCategory = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    peakHour: `${peakHour}:00 - ${peakHour + 1}:00`,
    peakDay,
    topCategory: topCategory ? topCategory[0].replace(/_/g, ' ') : 'N/A',
    totalListings: allFoods.length,
    hourDistribution: hourCounts,
    dayDistribution: dayCounts,
    categoryDistribution: categoryCounts
  };
}


// ============================================
// EXPORTS
// ============================================

module.exports = {
  classifyFood,
  predictFreshness,
  getRecommendations,
  predictDemand,
  FOOD_CATEGORIES
};
