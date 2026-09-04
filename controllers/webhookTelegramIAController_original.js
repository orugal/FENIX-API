const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const db = require("../database/database");
require("dotenv").config();

const TOKEN = process.env.TELEGRAM_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID;
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});




exports.receive = async (req, res) => {
    try {
        const mensaje = req.body.message;
        if (!mensaje || !mensaje.text) {
            return res.sendStatus(200);
        }
        const chatId = mensaje.chat.id;
        const texto = mensaje.text.trim();
        console.log("Chat:", chatId);
        console.log("Mensaje:", texto);

        if (ALLOWED_USER_ID && String(mensaje.from.id) !== String(ALLOWED_USER_ID)) {
            await enviarTelegram(
                chatId,
`🔒 *Acceso restringido*

Soy *FENIX*, asistente de IA privado.
Este canal está reservado exclusivamente para mi operador autorizado.

Tu solicitud ha sido registrada y descartada.`
            );
            return res.sendStatus(200);
        }

        let respuesta;
        /*
        |--------------------------------------------------------------------------
        | MENSAJES NATURALES
        |--------------------------------------------------------------------------
        */
        if (!texto.startsWith("/")) {
            try {
                const resultado = await interpretarMensaje(texto);
                console.log("Respuesta de Gemini:", resultado);
                /*
                |--------------------------------------------------------------------------
                | CONVERSACIÓN NORMAL
                |--------------------------------------------------------------------------
                */
                if (resultado.type === "conversation") {
                    respuesta = resultado.response;
                }
                /*
                |--------------------------------------------------------------------------
                | COMANDO INTERPRETADO
                |--------------------------------------------------------------------------
                */
                else if (resultado.type === "command") {
                    if (!resultado.device) {
                        respuesta =
                           "❌ No pude identificar el dispositivo.";
                    }
                    else {
                        await insertarComando(
                            resultado.device,
                            resultado.command,
                            resultado.value ?? null
                        );
                        respuesta = resultado.response ||
                            `✅ Comando enviado a ${resultado.device}`;
                    }
                }
                /*
                |--------------------------------------------------------------------------
                | RESPUESTA DESCONOCIDA
                |--------------------------------------------------------------------------
                */
                else {
                    respuesta =
                        "❌ No pude interpretar correctamente tu solicitud.";
                }
                respuesta += `\n\n📊 Tokens usados: ${resultado.tokensUsados}`;
            }
            catch (err) {
                console.error(
                    "Error interpretando mensaje con Gemini:",
                    err
                );
                respuesta =
                    "❌ Ocurrió un error intentando entender tu solicitud.";
            }
        }
        /*
        |--------------------------------------------------------------------------
        | COMANDOS TRADICIONALES DE TELEGRAM
        |--------------------------------------------------------------------------
        */
        else {
            const partes = texto.split(" ");
            const comando = partes[0].toLowerCase();
            respuesta = "❌ Comando no reconocido.";
            switch (comando) {
                case "/led":
                    if (partes.length < 3) {
                        respuesta =
                           "Uso: /led DISPOSITIVO on|off";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "led",
                        partes[2]
                    );
                    respuesta =`✅ Comando recibido.
Dispositivo: ${partes[1]}
Acción: LED ${partes[2]}`;
                    break;
                case "/takepic":
                    if (partes.length < 3) {
                        respuesta =
                            "Uso: /takepic DISPOSITIVO CAMARA_001";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "takepic",
                        partes[2]
                    );
                    respuesta =
                       `📷 Solicitud enviada a ${partes[1]}`;
                    break;
                case "/status":
                    if (partes.length < 2) {
                        respuesta =
                            "Uso: /status DISPOSITIVO";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "status",
                        null
                    );
                    respuesta =
                        `📡 Consultando estado de ${partes[1]}`;
                    break;
                case "/wifi":
                    if (partes.length < 2) {
                        respuesta =
                            "Uso: /wifi DISPOSITIVO";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "wifi",
                        null
                    );
                    respuesta =
                        `📡 Consultando estado de la WiFi en ${partes[1]}`;
                    break;
                case "/wifireset":
                    if (partes.length < 2) {
                        respuesta =
                            "Uso: /wifireset DISPOSITIVO";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "wifireset",
                        null
                    );
                    respuesta =
                        `📡 Reiniciando la WiFi en ${partes[1]}`;
                    break;
                case "/clientesap":
                    if (partes.length < 2) {
                        respuesta =
                            "Uso: /clientesap codigo_sap_cliente";
                        break;
                    }
                    try {
                        const response = await axios.post(
                            "https://n8n.srv1097949.hstgr.cloud/webhook/clientesCedula",
                            {
                               busqueda: partes[1]
                            }
                        );
                        const cliente = response.data.datos[0];
                        respuesta =
`👤 *Cliente encontrado*

🆔 Código: ${cliente.Codigo}
📄 Documento: ${cliente.NIT}

🙍 Nombre: ${cliente.Nombre}
🙍 Código Empleado: ${cliente.CodigoEmpl}
🙍 Empleado de ventas: ${cliente.EmpleadoVentas}

📍 Dirección: ${cliente.Direccion}
🏙️ Ciudad: ${cliente.Ciudad}

📞 Teléfono: ${cliente.Telefono}
📧 Correo: ${cliente.Mail}

💰 Saldo: $${cliente.Saldo.toLocaleString('es-CO')}
⚠️ Saldo vencido: $${cliente.SaldoVencido.toLocaleString('es-CO')}

💳 Condición de pago: ${cliente.CondicionPago}
🏷️ Lista de precios: ${cliente.ListaPrecio}
`;
                    }
                    catch (err) {
                        respuesta =
                            `📡 Error al consultar el cliente: ${err.message}`;
                    }
                    break;
                case "/bluetoothlist":
                    if (partes.length < 2) {
                        respuesta =
                            "Uso: /bluetoothlist DISPOSITIVO";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "bluetoothlist",
                        null
                    );
                    respuesta =
                        `📡 Consultando lista de dispositivos Bluetooth en ${partes[1]}`;
                    break;
                case "/wifilist":
                    if (partes.length < 2) {
                        respuesta =
                           "Uso: /wifilist DISPOSITIVO";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "wifilist",
                        null
                    );
                    respuesta =
                        `📡 Consultando lista de dispositivos WiFi en ${partes[1]}`;
                    break;
                case "/wifilab":
                    if (partes.length < 3) {
                        respuesta =
                            "Uso: /wifilab DISPOSITIVO nombre_wifi";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "wifilab",
                        partes[2]
                    );
                    respuesta =
                        `📡 Creando WIFI de prueba: ${partes[2]}`;
                    break;
                case "/irprueba":
                    if (partes.length < 3) {
                        respuesta = "Uso: /irprueba DISPOSITIVO 0x20DF10EF";
                        break;
                    }
                    await insertarComando(
                        partes[1],
                        "irprueba",
                        partes[2]
                    );
                    respuesta = `📡 señal enviada al IR en ${partes[1]}`;
                    break;
            }
        }
        /*
        |--------------------------------------------------------------------------
        | RESPONDER AL USUARIO EN TELEGRAM
        |--------------------------------------------------------------------------
        */
        await enviarTelegram(
            chatId,
            respuesta
        );
        res.sendStatus(200);
    }
    catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
};
async function interpretarMensaje(texto) {
    const prompt = `
Eres FENIX, un asistente IoT. Interpreta el mensaje del usuario en español y responde ÚNICAMENTE con JSON válido.

ACCIONES DISPONIBLES:

led:
- Enciende o apaga un LED.
- value: "on" o "off"

status:
- Consulta el estado del dispositivo.
- value: null

wifi:
- Consulta la información WiFi.
- value: null

takepic:
- Toma una foto y la envía. Dispositivo por defecto es MAX
- value: null

wifireset:
- Reinicia la configuración WiFi.
- value: null

bluetoothlist:
- Lista dispositivos Bluetooth.
- value: null

wifilist:
- Lista redes WiFi disponibles.
- value: null

wifilab:
- Crea una red WiFi de prueba.
- value: nombre de la red WiFi

clientesap:
- Consultar un cliente se SAP con la cédula.
- value: cédula del cliente

clientesap:
- Consultar un cliente se SAP con la cédula.
- value: cédula del cliente

irprueba:
- Manda un valor NEC a un infrarojo.
- value: valor protocolo NEC, ejemplo: 0x20Df10EF. Si no tienes el código NEC entiende la orden que te dan y ejecuta un comando NEC que corresponda.

DISPOSITIVO:
- Si el usuario no menciona un dispositivo, usa "FENIXONE".
- Si menciona otro dispositivo, usa exactamente el nombre indicado.
- Nunca uses device: null para una acción.

COMANDO:
{
  "type": "command",
  "command": "acción",
  "device": "dispositivo",
  "value": "valor o null",
  "response": "respuesta breve en español"
}

CONVERSACIÓN:
{
  "type": "conversation",
  "response": "respuesta natural en español, siendo amable y cortés"
}

REGLAS:
- No inventes acciones.
- No inventes nombres de dispositivos.
- Si falta un dato indispensable distinto al dispositivo, pide ese dato usando type "conversation".
- No uses Markdown.
- Devuelve únicamente JSON válido.

MENSAJE DEL USUARIO:

${texto}
`;

    const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt
    });

    const textoRespuesta = response.text.trim();

    const resultado = JSON.parse(textoRespuesta);

    const tokensUsados = response.usageMetadata?.totalTokenCount || 0;

    return {
        ...resultado,
        tokensUsados
    };
}


async function insertarComando(device, command, value) {

    const [result] = await db.execute(

        `INSERT INTO commands
        (
            device,
            command,
            value
        )
        VALUES
        (
            ?, ?, ?
        )`,

        [

            device,
            command,
            value

        ]

    );

    console.log("Comando insertado:", result.insertId);

}



async function enviarTelegram(chatId, texto) {

    try {

        await axios.post(

            `https://api.telegram.org/bot${TOKEN}/sendMessage`,

            {

                chat_id: chatId,
                text: texto,
                parse_mode: "Markdown"

            }

        );

    }
    catch (err) {

        console.error(

            err.response?.data || err.message

        );

    }

}