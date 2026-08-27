const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const {
  ASSISTANT_NAME,
  ASSISTANT_MEANING,
  getLlmConfig,
  chatWithIris,
} = require('../services/assistant');

const router = express.Router();

router.get('/status', requireAdmin, (_req, res) => {
  const llm = getLlmConfig();
  res.json({
    name: ASSISTANT_NAME,
    meaning: ASSISTANT_MEANING,
    enabled: true,
    provider: llm?.provider || 'local',
  });
});

router.post('/chat', requireAdmin, async (req, res) => {
  try {
    const { messages, period, from, to } = req.body || {};
    const result = await chatWithIris({ messages, period, from, to });
    res.json(result);
  } catch (err) {
    console.error('POST assistant/chat:', err.message);
    res.status(err.status || 500).json({
      error: err.message || 'Iris no pudo responder',
      code: err.code || null,
    });
  }
});

module.exports = router;
