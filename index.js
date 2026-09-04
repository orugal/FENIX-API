const express = require("express");
const cors = require("cors");
const commands = require("./routes/commands");
const webhookTelegram = require("./routes/webhookTelegram");
const googlRoutes = require("./routes/google");
const fs = require('fs');
const db = require('./database/database');
const schema = fs.readFileSync('./database/schema.sql', 'utf8');
require("dotenv").config();


const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/commands", commands);
app.use("/webhookTelegram", webhookTelegram);
app.use("/google", googlRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🔥 FENIX ha renacido de las cenizas y alza el vuelo en el puerto ${PORT} 🔥`);
});
