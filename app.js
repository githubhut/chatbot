require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chatbot";

// MongoDB Models
const conversationSchema = new mongoose.Schema({
    conversationId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    messages: [{
        role: { type: String, required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    language: { type: String, default: "en-US" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Conversation = mongoose.model("Conversation", conversationSchema);

// Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health Check Endpoint (now includes DB status)
app.get("/health", async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    
    res.json({
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: dbStatus,
        activeConnections: mongoose.connections.length
    });
});

app.post('/register', 
    [
        body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { username, password } = req.body;
            
            // Check if user exists
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create user
            const user = new User({
                username,
                password: hashedPassword
            });

            await user.save();

            res.status(201).json({ message: 'User created successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Error creating user' });
        }
    }
);

// Login endpoint
app.post('/login', 
    [
        body('username').notEmpty().withMessage('Username is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { username, password } = req.body;
            
            // Find user
            const user = await User.findOne({ username });
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Create JWT token
            const token = jwt.sign(
                { userId: user._id },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '1h' }
            );

            res.json({ token, userId: user._id });
        } catch (error) {
            res.status(500).json({ error: 'Error logging in' });
        }
    }
);

// Get all conversations
app.get("/conversations", authMiddleware, async (req, res) => {
    try {
        const conversations = await Conversation.find({ userId: req.userData.userId })
            .sort({ updatedAt: -1 })
            .limit(20)
            .select('conversationId messages createdAt updatedAt');
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: "Error fetching conversations" });
    }
});

// Get specific conversation
app.get("/conversation/:conversation_id", authMiddleware, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({ 
            conversationId: req.params.conversation_id,
            userId: req.userData.userId
        });
        
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }
        
        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Main chat endpoint with persistence
app.post("/", authMiddleware,
    [
        body("message").isString().notEmpty().withMessage("Message is required"),
        body("conversation_id").isString().notEmpty().withMessage("Conversation ID is required"),
        body("lang").optional().isString()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { message, conversation_id, lang = "en-US" } = req.body;

        try {
            // Find or create conversation
            let conversation = await Conversation.findOneAndUpdate(
                { 
                    conversationId: conversation_id,
                    userId: req.userData.userId
                },
                {
                    $setOnInsert: {
                        conversationId: conversation_id,
                        userId: req.userData.userId,
                        language: lang,
                        messages: [{
                            role: "system",
                            content: `You are a helpful AI assistant.`
                        }]
                    },
                    $set: { updatedAt: new Date() }
                },
                { 
                    upsert: true, 
                    new: true,
                    setDefaultsOnInsert: true 
                }
            );

            // Add user message
            conversation.messages.push({
                role: "user",
                content: message
            });

            // Prepare messages for API (without timestamps)
            const apiMessages = conversation.messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            // Call Groq API
            const response = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    model: "llama-3.1-8b-instant",
                    messages: apiMessages,
                    temperature: 1,
                    max_tokens: 1024,
                    top_p: 1
                },
                {
                    headers: {
                        "Authorization": `Bearer ${GROQ_API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            // Add AI response
            const aiResponse = response.data.choices[0].message;
            conversation.messages.push({
                role: aiResponse.role,
                content: aiResponse.content
            });

            // Save updated conversation
            await conversation.save();

            res.json({ 
                response: aiResponse.content, 
                conversation_id,
                history: conversation.messages.length
            });

        } catch (error) {
            console.error("Error:", error);
            res.status(500).json({ 
                error: "Error processing your request",
                details: error.message 
            });
        }
    }
);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
