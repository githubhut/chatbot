const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication failed' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.userData = { userId: decoded.userId }; // Make sure this is set
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Authentication failed' });
    }
};