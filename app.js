const cookieParser = require('cookie-parser');
const express = require('express');
const ejs = require('ejs');
const crypto = require('crypto');
const database = require('./database.js');

const app = express();
const port = 3000;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
    let products = await database.getProducts();
    let sessionToken = req.cookies['cafejs_session'];
    let user = await database.getUserBySessionToken(sessionToken);
    
    console.log('User from session:', user);

    let data = {
        products: products,
        user: user,
    };

    ejs.renderFile('views/index.ejs', data, (err, str) => {
        res.send(str);
    });
});

app.get('/product/:productId', async (req, res) => {
    try {
        let product = await database.getProductById(req.params.productId);
        if (!product) {
            res.status(404).send('Product not found');
            return;
        }
        let data = { product: product };

        ejs.renderFile('views/product_detail.ejs', data, (err, str) => {
            if (err) {
                console.error(err);
                res.status(500).send('An error occurred while rendering the page');
            } else {
                res.send(str);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});

app.post('/product/:productId', async (req, res) => {
    try {
        let sessionToken = req.cookies['cafejs_session'];
        let user = await database.getUserBySessionToken(sessionToken);

        if (!user) {
            res.status(401).send('Unauthorized: Please log in to add items to your cart.');
            return;
        }

        let userId = user.id;
        let quantity = req.body.quantity;
        let productId = req.body.product_id;

        if (!quantity || quantity <= 0) {
            res.status(400).send('Invalid quantity. Please provide a valid number.');
            return;
        }

        await database.createCartItem(productId, quantity, userId);

        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred while adding the product to the cart.');
    }
});

app.get('/login', (req, res) => {
    ejs.renderFile('views/login.ejs', (err, str) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error rendering login page');
        } else {
            res.send(str);
        }
    });
});

app.post('/login', async (req, res) => {
    let user = await database.getUserByUsername(req.body.username);
    if (!user || user.password != req.body.password) {
        res.send('Invalid login details!');
        return;
    }

    let sessionToken = crypto.randomBytes(16).toString('base64');
    res.cookie('cafejs_session', sessionToken);
    database.setSession(sessionToken, user.id);
    res.redirect('/');
});

app.get('/cart', async (req, res) => {
    let sessionToken = req.cookies['cafejs_session'];
    let user = await database.getUserBySessionToken(sessionToken);
    let cartItems = await database.getCartItemsByUser(user);
    let data = {
        user: user,
        cartItems: cartItems,
    };

    ejs.renderFile('views/cart.ejs', data, (err, str) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error rendering cart page');
        } else {
            res.send(str);
        }
    });
});

app.post('/cart', async (req, res) => {
    try {
        let userId = req.body.user_id;
        userId = Number(userId);
        let user = await database.getUserById(userId);
        await database.checkoutCartForUser(user);

        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred during checkout');
    }
});

app.listen(port, () => console.log(`App is listening on port ${port}`));