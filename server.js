const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt'); // Import bcrypt
const app = express();
const session = require('express-session');

app.use(express.static('public'));

app.use(
  session({
    secret: 'mySecretKey', // Replace with a strong secret key
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Use `secure: true` if using HTTPS
  })
);

// Middleware to disable caching globally
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Middleware to parse incoming form data
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Set up view engine for EJS (for rendering dynamic pages like home.ejs)
app.set('view engine', 'ejs');

// Connect to MongoDB using Mongoose
mongoose.connect('mongodb+srv://Ryan:Ryan@ryan-mongo.x3lln.mongodb.net/?retryWrites=true&w=majority&appName=Ryan-mongo')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Define an Image model
const Image = mongoose.model(
  'Image',
  new mongoose.Schema({
    imageid: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    filename: { type: String, required: true }, // Store the file name of the image
    filepath: { type: String, required: true }, // Store the file path for serving the image
  })
);

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// Define a User model for MongoDB
const User = mongoose.model(
  'User',
  new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  })
);

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }
  next();
};

// Home page (restricted to logged-in users)
app.get('/', checkAuth, async (req, res) => {
  try {
    const images = await Image.find();
    res.render('home', { username: req.session.username, images, nImages: images.length });
  } catch (err) {
    console.error(err);
    res.send('Error loading home page: ' + err.message);
  }
});

// Route to serve the signup form (GET /signup)
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Route to serve the login form (GET /login)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Route to handle sign-up form submission
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Hash the password with bcrypt (10 rounds of salt)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new User object with the hashed password
    const newUser = new User({ username, password: hashedPassword });

    // Save the user to MongoDB
    await newUser.save();

    // Redirect to login page after successful registration
    res.redirect('/login');
  } catch (err) {
    // Handle error (e.g., duplicate username)
    console.error(err);
    res.send('Error registering user: ' + err.message);
  }
});

// Route to handle login form submission
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.send(
        '<script>alert("Invalid username or password."); window.location.href="/login";</script>'
      );
    }

    // Save the username in the session
    req.session.username = user.username;

    // Fetch all images from the database
    const images = await Image.find();

    // Render the home page
    res.render('home', { username: user.username, images, nImages: images.length });
  } catch (err) {
    console.error(err);
    res.send('Error logging in: ' + err.message);
  }
});

// Route to display the home page (only thumbnails)
app.get('/', async (req, res) => {
  try {
    const images = await Image.find(); // Fetch all images from the database
    res.render('home', { username: 'User', images, nImages: images.length });
  } catch (err) {
    console.error(err);
    res.send('Error loading home page: ' + err.message);
  }
});

// Route to handle creating a new image (GET /create)
app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Route to handle image uploads (POST /upload)
app.post('/upload', upload.single('image'), async (req, res) => {
  const { imageid, description } = req.body;
  const { filename, path: filepath } = req.file;

  try {
    // Validate description length
    if (description.length > 50) {
      return res.send(
        '<script>alert("Description cannot exceed 50 characters."); window.history.back();</script>'
      );
    }

    const newImage = new Image({ imageid, description, filename, filepath });
    await newImage.save();
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send('Error uploading image: ' + err.message);
  }
});

// Route to display the detail page for a specific image
app.get('/detail', async (req, res) => {
  const { _id } = req.query; // Get the image ID from the query string

  try {
    const image = await Image.findById(_id); // Fetch the image details from the database
    if (!image) {
      return res.send('Image not found');
    }
    res.render('detail', { image }); // Render the detail page with the image data
  } catch (err) {
    console.error(err);
    res.send('Error loading detail page: ' + err.message);
  }
});

// Route to handle image download
app.get('/download', async (req, res) => {
  const { _id } = req.query; // Get the image ID from the query string

  try {
    const image = await Image.findById(_id); // Find the image by ID in the database
    if (!image) {
      return res.status(404).send('Image not found');
    }

    // Send the file as a download
    res.download(image.filepath, image.filename, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error downloading file');
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing download request');
  }
});

// Route to handle deleting an image (POST /delete)
app.post('/delete', async (req, res) => {
  const { _id } = req.query; // Get the image ID from the query string

  try {
    const image = await Image.findByIdAndDelete(_id); // Delete the image from the database

    if (image) {
      // Delete the image file from the server
      fs.unlinkSync(image.filepath);
    }

    // Redirect to the home page after deletion
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send('Error deleting image: ' + err.message);
  }
});

// Route to display the edit page (GET /edit)
app.get('/edit', async (req, res) => {
  const { _id } = req.query;

  try {
    const image = await Image.findById(_id);
    if (!image) {
      return res.send('Image not found');
    }
    res.render('edit', { image });
  } catch (err) {
    console.error(err);
    res.send('Error loading edit page: ' + err.message);
  }
});

// Add a Route to Render the Edit Page
app.get('/edit', checkAuth, async (req, res) => {
  const { _id } = req.query; // Get the image ID from the query string

  try {
    const image = await Image.findById(_id); // Find the image by ID
    if (!image) {
      return res.send('Image not found');
    }
    res.render('edit', { image }); // Render the edit page
  } catch (err) {
    console.error(err);
    res.send('Error loading edit page: ' + err.message);
  }
});

// Route to handle editing an image (POST /edit)
app.post('/edit', checkAuth, upload.single('image'), async (req, res) => {
  const { _id, imageid, description } = req.body;
  const file = req.file;

  try {
    // Validate description length
    if (description.length > 50) {
      return res.send(
        '<script>alert("Description cannot exceed 50 characters."); window.history.back();</script>'
      );
    }

    const image = await Image.findById(_id);
    if (!image) {
      return res.send('Image not found');
    }

    // Update the image information
    if (file) {
      fs.unlinkSync(image.filepath); // Delete old image file
      image.filename = file.filename; // Update filename
      image.filepath = file.path; // Update file path
    }

    image.imageid = imageid;
    image.description = description;

    await image.save();
    res.redirect(`/detail?_id=${_id}`);
  } catch (err) {
    console.error(err);
    res.send('Error updating image: ' + err.message);
  }
});

// Logout route
app.get('/logout', (req, res) => {
  const username = req.session.username; // Retrieve the username before destroying the session

  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.send('Error logging out: ' + err.message);
    }

    // Render the logout page with the username
    res.render('logout', { username: username || 'User' });
  });
});

// Start the server on port 3000
app.listen(3000, () => {
  console.log('Express server running on http://localhost:3000');
});
