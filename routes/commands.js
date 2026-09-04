const express = require("express");
const router = express.Router();

const controller = require("../controllers/commandsController");

router.get("/", controller.getCommands);
router.post("/", controller.postCommand);
router.put("/:id/done", controller.doneCommand);

module.exports = router;