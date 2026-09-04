const express = require("express");
const router = express.Router();
const googleController = require("../controllers/googleController");
router.get('/auth', googleController.auth);
router.post("/callback", googleController.callback);
module.exports = router;