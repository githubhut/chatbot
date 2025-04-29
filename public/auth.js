// DOM Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const passwordInputs = document.querySelectorAll('input[type="password"]');
const togglePasswordIcons = document.querySelectorAll('.toggle-password');

// Toggle password visibility
togglePasswordIcons.forEach(icon => {
    icon.addEventListener('click', (e) => {
        const input = e.target.previousElementSibling;
        const isPassword = input.type === 'password';
        
        input.type = isPassword ? 'text' : 'password';
        e.target.classList.toggle('fa-eye');
        e.target.classList.toggle('fa-eye-slash');
    });
});

// Password strength indicator (register page)
const passwordInput = document.getElementById('registerPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const strengthBars = document.querySelectorAll('.strength-bar');
const strengthText = document.querySelector('.strength-text');
const passwordMatch = document.querySelector('.password-match');

if (passwordInput) {
    passwordInput.addEventListener('input', checkPasswordStrength);
    confirmPasswordInput.addEventListener('input', checkPasswordMatch);
}

function checkPasswordStrength() {
    const password = passwordInput.value;
    const strength = calculatePasswordStrength(password);
    const strengthContainer = passwordInput.closest('.form-group').querySelector('.password-strength');
    
    strengthContainer.style.display = password ? 'block' : 'none';
    
    // Reset all bars
    strengthBars.forEach(bar => bar.classList.remove('active'));
    
    // Activate bars based on strength
    if (strength > 0) strengthBars[0].classList.add('active');
    if (strength > 1) strengthBars[1].classList.add('active');
    if (strength > 2) strengthBars[2].classList.add('active');
    
    // Update text
    const strengthLabels = ['Weak', 'Medium', 'Strong'];
    strengthText.textContent = `Password strength: ${strengthLabels[strength - 1]}`;
}

function calculatePasswordStrength(password) {
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    // Contains numbers
    if (/\d/.test(password)) strength++;
    // Contains special chars
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;
    
    return Math.min(strength, 3); // Cap at 3
}

function checkPasswordMatch() {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    if (!password || !confirmPassword) {
        passwordMatch.style.display = 'none';
        return;
    }
    
    passwordMatch.style.display = 'flex';
    
    if (password === confirmPassword) {
        passwordMatch.style.color = '#00C851';
        passwordMatch.innerHTML = '<i class="fas fa-check-circle"></i><span>Passwords match</span>';
    } else {
        passwordMatch.style.color = '#ff4444';
        passwordMatch.innerHTML = '<i class="fas fa-times-circle"></i><span>Passwords don\'t match</span>';
    }
}

// Form submission handlers
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const response = await fetch('https://chatbot-jl8o.onrender.com/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('userId', data.userId);
                window.location.href = 'index.html';
            } else {
                if (data.errors) {
                    const messages = data.errors.map(err => err.msg).join(', ');
                    showError(messages);
                } else {
                    showError(data.error || 'Login failed');
                }
            }
        } catch (error) {
            showError('Error logging in: ' + error.message);
        }
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        try {
            const response = await fetch('https://chatbot-jl8o.onrender.com/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showSuccess('Registration successful! Redirecting to login...');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } else {
                if (data.errors) {
                    const messages = data.errors.map(err => err.msg).join('<br> ');
                    showError(messages);
                } else {
                    showError(data.error || 'Registration failed');
                }
            }
        } catch (error) {
            showError('Error registering: ' + error.message);
        }
    });
}

// Helper functions
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'auth-message error';
    errorElement.innerHTML = message;
    
    const card = document.querySelector('.auth-card');
    const firstChild = card.firstChild;
    card.insertBefore(errorElement, firstChild);
    
    setTimeout(() => {
        errorElement.remove();
    }, 3000);
}

function showSuccess(message) {
    const successElement = document.createElement('div');
    successElement.className = 'auth-message success';
    successElement.innerHTML = message;
    
    const card = document.querySelector('.auth-card');
    const firstChild = card.firstChild;
    card.insertBefore(successElement, firstChild);
    
    setTimeout(() => {
        successElement.remove();
    }, 3000);
}