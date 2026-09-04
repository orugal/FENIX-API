const axios = require("axios");
const db = require("../database/database");
require("dotenv").config();

const TOKEN = process.env.TELEGRAM_TOKEN;

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

        const partes = texto.split(" ");

        const comando = partes[0].toLowerCase();

        let respuesta = "❌ Comando no reconocido.";

        switch (comando) {

            case "/led":

                if (partes.length < 3) {
                    respuesta = "Uso: /led DISPOSITIVO on|off";
                    break;
                }

                await insertarComando(

                    partes[1],
                    "led",
                    partes[2]

                );

                respuesta = `✅ Comando recibido.

                    Dispositivo: ${partes[1]}
                    Acción: LED ${partes[2]}`;

                break;


            case "/takepic":

                if (partes.length < 3) {
                    respuesta = "Uso: /takepic device CAMARA_001";
                    break;
                }

                await insertarComando(

                    partes[1],
                    "takepic",
                    partes[2]

                );

                respuesta = `📷 Solicitud enviada a ${partes[1]}`;

                break;


            case "/status":

                if (partes.length < 2) {
                    respuesta = "Uso: /status DISPOSITIVO";
                    break;
                }

                await insertarComando(

                    partes[1],
                    "status",
                    null

                );

                respuesta = `📡 Consultando estado de ${partes[1]}`;

                break;

            case "/wifi":

                if (partes.length < 2) {
                    respuesta = "Uso: /wifi DISPOSITIVO";
                    break;
                }

                await insertarComando(

                    partes[1],
                    "wifi",
                    null

                );

                respuesta = `📡 Consultando estado de la wifi en ${partes[1]}`;

                break;
             case "/wifireset":
                if (partes.length < 2) {
                    respuesta = "Uso: /wifireset DISPOSITIVO";
                    break;
                }
                await insertarComando(
                    partes[1],
                    "wifireset",
                    null
                );
                respuesta = `📡 Reiniciando la wifi en ${partes[1]}`;
                break;

            case "/irprueba":
                if (partes.length < 2) {
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

            case "/clientesap":

                if (partes.length < 2) {
                    respuesta = "Uso: /clientesap codigo_sap_cliente";
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
                    //err.response?.data || err.message
                    respuesta = `📡 Error al consultar el cliente: ${err.message}`;
                }
                
             break;

             case "/bluetoothlist":
                if (partes.length < 2) {
                    respuesta = "Uso: /bluetoothlist DISPOSITIVO";
                    break;
                }

                await insertarComando(

                    partes[1],
                    "bluetoothlist",
                    null

                );

                respuesta = `📡 Consultando lista de dispositivos bluetooth en ${partes[1]}`;
             break; 
             case "/wifilist":
                if (partes.length < 2) {
                    respuesta = "Uso: /wifilist DISPOSITIVO";
                    break;
                }

                await insertarComando(

                    partes[1],
                    "wifilist",
                    null

                );

                respuesta = `📡 Consultando lista de dispositivos wifi en ${partes[1]}`;
             break;
              case "/wifilab":
                if (partes.length < 3) {
                    respuesta = "Uso: /wifilab DISPOSITIVO nombre_wifi";
                    break;
                }

                await insertarComando(

                    partes[1],
                    "wifilab",
                    partes[2]

                );

                respuesta = `📡 Creando WIFI de prueba: ${partes[2]}`;
             break;

        }

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
                text: texto

            }

        );

    }
    catch (err) {

        console.error(

            err.response?.data || err.message

        );

    }

}