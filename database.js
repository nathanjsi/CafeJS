const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db');

let products = [
    {
        id: 1,
        name: 'Americano',
        price: 100,
        description: 'Espresso, diluted with hot water for a lighter experience',
    },
    {
        id: 2,
        name: 'Cappuccino',
        price: 110,
        description: 'Espresso with steamed milk',
    },
    {
        id: 3,
        name: 'Espresso',
        price: 90,
        description: 'A strong shot of coffee',
    },
    {
        id: 4,
        name: 'Macchiato',
        price: 120,
        description: 'Espresso with a small amount of milk',
    },
];

let users = [
    {
        id: 1,
        username: 'zagreus',
        password: 'cerberus',
    },
    {
        id: 2,
        username: 'melinoe',
        password: 'b4d3ec1',
    },
];

let sessions = {};

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS cjs_user (username TEXT, password TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS cjs_product (name TEXT, price INTEGER, description TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS cjs_session (token TEXT, user_id INTEGER)");
    db.run("CREATE TABLE IF NOT EXISTS cjs_cart_item (product_id INTEGER, quantity INTEGER, user_id INTEGER)");
    db.run("CREATE TABLE IF NOT EXISTS cjs_transaction (user_id INTEGER, created_at TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS cjs_line_item (transaction_id INTEGER, product_id INTEGER, quantity INTEGER)");

    db.get('SELECT COUNT(*) AS count FROM cjs_user', [], (err, row) => {
        if (row.count === 0) {
            let stmt = db.prepare("INSERT INTO cjs_user (username, password) VALUES (?, ?)");
            users.forEach((v) => stmt.run(v.username, v.password));
            stmt.finalize();
        }
    });

    db.get('SELECT COUNT(*) AS count FROM cjs_product', [], (err, row) => {
        if (row.count === 0) {
            let stmt = db.prepare("INSERT INTO cjs_product (name, price, description) VALUES (?, ?, ?)");
            products.forEach((v) => stmt.run(v.name, v.price, v.description));
            stmt.finalize();
        }
    });
});

function getProducts() {
    return new Promise((resolve, reject) => {
        db.all('SELECT rowid AS id, name, price, description FROM cjs_product', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getProductById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT rowid AS id, name, price, description FROM cjs_product WHERE rowid = ?', [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function getUsers() {
    return new Promise((resolve, reject) => {
        db.all('SELECT rowid AS id, username, password FROM cjs_user', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getUserById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT rowid AS id, username, password FROM cjs_user WHERE rowid = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function getUserByUsername(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT rowid AS id, username, password FROM cjs_user WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function getSessions() {
    return sessions;
}

function getUserBySessionToken(sessionToken) {
    let userId = sessions[sessionToken];
    return userId ? getUserById(userId) : null;
}

function setSession(sessionToken, userId) {
    sessions[sessionToken] = userId;
}

function createCartItem(productId, quantity, userId) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            let stmt = db.prepare('INSERT INTO cjs_cart_item (product_id, quantity, user_id) VALUES (?, ?, ?)');
            stmt.run(productId, quantity, userId, (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    });
}

function getCartItemsByUser(user) {
    return new Promise((resolve, reject) => {
        let userId = user.id;
        let query = `
        SELECT
            SUM(cjs_cart_item.quantity) AS quantity,
            cjs_product.name AS product_name
        FROM cjs_cart_item
        LEFT JOIN cjs_product
        ON cjs_cart_item.product_id = cjs_product.rowid
        WHERE cjs_cart_item.user_id = ?
        GROUP BY cjs_product.name
        `;
        db.all(query, [userId], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                let result = rows.map(row => ({
                    userId: userId,
                    quantity: row.quantity,
                    productName: row.product_name,
                }));
                resolve(result);
            }
        });
    });
}

function checkoutCartForUser(user) {
    return new Promise((resolve, reject) => {
        let userId = user.id;
        let query = `
            SELECT SUM(quantity) AS quantity, user_id, product_id
            FROM cjs_cart_item
            WHERE user_id = ?
            GROUP BY user_id, product_id
        `;
        db.all(query, [userId], (err, rows) => {
            if (err) return reject(err);

            resolve(
                rows.map((row) => ({
                    userId: row.user_id,
                    productId: row.product_id,
                    quantity: row.quantity,
                }))
            );
        });
    })
    .then((cartItems) => {
        return new Promise((resolve, reject) => {
            let now = new Date().toUTCString();
            db.serialize(() => {
                let query = `INSERT INTO cjs_transaction (created_at, user_id) VALUES (?, ?)`;
                db.run(query, [now, cartItems[0].userId], function () {
                    let transactionId = this.lastID;
                    let stmt = db.prepare(`
                        INSERT INTO cjs_line_item (transaction_id, product_id, quantity)
                        VALUES (?, ?, ?)
                    `);
                    cartItems.forEach((cartItem) => {
                        stmt.run(transactionId, cartItem.productId, cartItem.quantity);
                    });
                    stmt.finalize();
                    resolve(cartItems[0].userId);
                });
            });
        });
    })
    .then((userId) => {
        return new Promise((resolve, reject) => {
            let query = `DELETE FROM cjs_cart_item WHERE user_id = ?`;
            db.run(query, [userId], (err) => {
                if (err) return reject(err);
                resolve(true);
            });
        });
    });
}



module.exports = {
    getProducts,
    getProductById,
    getUsers,
    getUserById,
    getUserByUsername,
    getSessions,
    getUserBySessionToken,
    setSession,
    createCartItem,
    getCartItemsByUser,
    checkoutCartForUser,
};