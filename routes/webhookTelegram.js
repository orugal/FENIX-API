const express = require("express");
const router = express.Router();

const controller = require("../controllers/webhookTelegramController");
const controllerIA = require("../controllers/webhookTelegramIAController");

router.post("/", controllerIA.receive);

module.exports = router;