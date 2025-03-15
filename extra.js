const bcrypt = require('bcryptjs');

bcrypt.hash("prince", 10, (err, hash) => {
    if (err) console.error("❌ Error hashing password:", err);
    else console.log("✅ New hashed password:", hash);
});
