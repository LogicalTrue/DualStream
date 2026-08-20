let stateStore = {
  streamer: 'blackozutr',
  videoUrl: 'https://www.youtube.com/watch?v=A8qw5r6aDYo',
  camX: 2,
  camY: 3,
  camW: 26,
  currentTime: 0,
  isPlaying: false,
  updatedAt: Date.now()
};

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (data) {
        stateStore = {
          ...stateStore,
          ...data,
          updatedAt: Date.now()
        };
      }
      return res.status(200).json(stateStore);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  return res.status(200).json(stateStore);
};
