const { google } = require('googleapis');
const db = require("../database/database");
require("dotenv").config();
const SCOPES = [
    'https://www.googleapis.com/auth/calendar'
];
const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID_GOOGLE,
    process.env.CLIENT_SECRET_GOOGLE,
    process.env.GOOGLE_REDIRECT_URI
);
/**
 * Inicia la autenticación con Google
 */
exports.auth = async (req, res) => {
    try {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
        });
        return res.redirect(authUrl);
    }
    catch(err){
        console.log(err);
        return res.status(500).json({
            error: true,
            message: 'Error iniciando autenticación con Google'
        });
    }
};

/**
 * Callback de Google después de autorizar
 */
exports.callback = async (req, res) => {
    try{
        const { code } = req.query;
        if (!code) {
            return res.status(400).json({
                error: true,
                message: 'No se recibió el código de autorización'
            });
        }
        const { tokens } = await oauth2Client.getToken(code);
        console.log('Tokens recibidos:', tokens);
        /*
         * IMPORTANTE:
         *
         * Aquí debemos guardar el refresh_token
         * en la base de datos.
         */
        const refreshToken = tokens.refresh_token;

        if (!refreshToken) {

            return res.status(400).json({
                error: true,
                message: 'Google no devolvió refresh_token'
            });

        }
        // Por ahora solamente mostramos que funcionó
        return res.json({
            error: false,
            message: 'Google Calendar conectado correctamente'
        });
    }
    catch(err){
        console.log(err);
        return res.status(500).json({
            error: true,
            message: 'Error obteniendo autorización de Google'
        });

    }

};