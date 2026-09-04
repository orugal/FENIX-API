const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const db = require("../database/database");
const supabase = require('../config/supabase');

require("dotenv").config();

const TOKEN = process.env.TELEGRAM_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID;
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const GEMINI_MODEL = "gemini-3.1-flash-lite"; // verifica que tu cuenta tenga tool calling habilitado para este modelo
const TOKEN_API_WANNABE = "1a54107a5b7f8e2f1c9ab482f8438f6a95348a9eff4e2213366b7615700185fe";
/*
|--------------------------------------------------------------------------
| DEFINICIÓN DE TOOLS (functionDeclarations)
|--------------------------------------------------------------------------
| Cada acción que antes vivía "a mano" dentro del prompt JSON ahora es una
| tool real. Gemini decide sola cuál(es) usar y con qué parámetros, en vez
| de que tú fuerces un único JSON de salida.
|
| Para agregar una tool propia nueva:
|   1. Agrega su declaración aquí abajo (name, description, parametersJsonSchema).
|   2. Agrega el "case" correspondiente en executeTool() más abajo.
| Nada más del archivo necesita cambiar.
*/

const ahora = new Date();

const fechaColombia = ahora.toLocaleDateString("en-CA", {
    timeZone: "America/Bogota"
});

const horaColombia = ahora.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour12: false
});

const contextoFecha = `Fecha/hora Colombia (America/Bogota, UTC-5): ${fechaColombia} ${horaColombia}.
Calcula "hoy", "mañana", "pasado mañana" a partir de esta fecha, nunca uses UTC.`;

const toolDeclarations = [
    {
        name: "controlar_dispositivo",
        description:
            "Ejecuta una acción sobre un dispositivo ESP32 de FENIX: encender/apagar " +
            "un LED, consultar estado, consultar o reiniciar WiFi, tomar una foto, " +
            "listar redes WiFi o dispositivos Bluetooth, crear una red WiFi de prueba, " +
            "o enviar una señal infrarroja NEC. Si el usuario no menciona un " +
            "dispositivo, usa 'FENIXONE' por defecto.",
        parametersJsonSchema: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    enum: [
                        "led",
                        "status",
                        "wifi",
                        "takepic",
                        "wifireset",
                        "bluetoothlist",
                        "wifilist",
                        "wifilab",
                        "irprueba",
                    ],
                    description: "Acción a ejecutar sobre el dispositivo",
                },
                device: {
                    type: "string",
                    description:
                        "Nombre exacto del dispositivo. Si el usuario no lo menciona, usa 'FENIXONE'.",
                },
                value: {
                    type: "string",
                    description:
                        "Valor requerido según el comando: 'on'/'off' para led, nombre de red " +
                        "para wifilab, código NEC (ej. 0x20DF10EF) para irprueba. " +
                        "Para comandos que no requieren valor (status, wifi, takepic, " +
                        "wifireset, bluetoothlist, wifilist), omite este campo.",
                },
            },
            required: ["command", "device"],
        },
    },
    {
        name: "consultar_cuentas_banco",
        description:
            "Consulta el listado de cuentas bancarias registradas en el sistema " +
            "(banco, número de cuenta, tipo, etc.). Úsala cuando el usuario " +
            "pregunte qué bancos o cuentas bancarias maneja la empresa, o pida " +
            "el listado de cuentas de banco.",
        parametersJsonSchema: {
            type: "object",
            properties: {},
            // Sin parámetros requeridos: el endpoint devuelve el listado completo.
        },
    },
    {
        name: "buscar_repositorio_github",
        description:
            "Busca repositorios de GitHub de la organización cuyo nombre coincida " +
            "(parcial o aproximadamente) con lo que el usuario menciona. Úsala " +
            "SIEMPRE antes de consultar commits, ya que el usuario suele usar un " +
            "nombre coloquial del proyecto que no coincide exactamente con el " +
            "nombre real del repositorio (ej. dice 'fenix' pero el repo se llama " +
            "'api-fenix-2026').",
        parametersJsonSchema: {
            type: "object",
            properties: {
                busqueda: {
                    type: "string",
                    description: "Nombre o palabra clave del proyecto mencionado por el usuario",
                },
            },
            required: ["busqueda"],
        },
    },
    {
        name: "consultar_ultimo_commit",
        description:
            "Consulta el último commit de un repositorio de GitHub. Requiere el " +
            "nombre completo 'owner/repo' exacto — si no lo tienes aún, primero " +
            "usa la tool buscar_repositorio_github para resolverlo a partir del " +
            "nombre que dio el usuario.",
        parametersJsonSchema: {
            type: "object",
            properties: {
                repo: {
                    type: "string",
                    description: "Nombre completo del repositorio en formato 'owner/repo', obtenido de buscar_repositorio_github",
                },
                branch: {
                    type: "string",
                    description: "Rama a consultar. Si no se menciona, usa 'main'.",
                },
                autor: {
                    type: "string",
                    description:
                        "Usuario de GitHub del autor, SOLO si el usuario pide explícitamente " +
                        "'el commit que YO hice' o menciona un autor específico. Si no lo " +
                        "menciona, omite este campo.",
                },
            },
            required: ["repo"],
        },
    },
    {
        name: "ganancias_por_ano",
        description:
            "Consulta las ganancias por año, estas ganancias pertenecen a Farez Prieto por concepto del trabajo diario"+
            "Retorna un json completo desde el año 2016."+
            "Con estas cifras puede ver como cierra en dinero a 31 de diciembre de cada año"+
            "No necesita parametro del año.",
        parametersJsonSchema: {
            type: "object",
            properties: {},
            // Sin parámetros requeridos: el endpoint devuelve el listado completo.
        },
    },
    {
        name: "ganancias_totales_empresa",
        description:
            "Consulta las ganancias totales de la empresa"+
            "Retorna un json con el valor total de lo que ha ganado la empresa desde el 2016."+
            "No necesita parametro del año.",
        parametersJsonSchema: {
            type: "object",
            properties: {},
            // Sin parámetros requeridos: el endpoint devuelve el listado completo.
        },
    },
    {
        name: "consulta_clientes_por_termino",
        description:
            "Consulta los clientes según el término de búsqueda proporcionado"+
            "Retorna un json con la lista de clientes que coinciden con el término de búsqueda."+
            "se requiere el parametro de busqueda que puede ser el nombre del cliente o el código del cliente.",
        parametersJsonSchema: {
            type: "object",
            properties: {
                termino: {
                    type: "string",
                    description: "Término de búsqueda para encontrar clientes."
                }
            },
            required: ["termino"]
        },
    },
    {
        name: "identifica_cliente",
        description:
            "Busca un cliente por nombre, número de documento o código y retorna exclusivamente su idCliente. " +
            "Utiliza esta herramienta cuando necesites identificar el cliente para realizar otra consulta. " +
            "No retorna información adicional del cliente.",
        parametersJsonSchema: {
            type: "object",
            properties: {
                termino: {
                    type: "string",
                    description:
                        "Nombre, número de documento o código del cliente que se desea identificar."
                }
            },
            required: ["termino"]
        }
    },
    {
        name: "consulta_cuentas_cobro",
        description:
            "Consulta información de cuentas de cobro. " +
            "La búsqueda puede realizarse por idCliente, por idCuentaCobro o por ambos. " +
            "Si el usuario identifica al cliente por nombre, primero utiliza " +
            "identifica_cliente para obtener el idCliente. " +
            "Si el usuario proporciona directamente el número o id de una cuenta de cobro, " +
            "utiliza idCuentaCobro y no es necesario obtener el idCliente. " +
            "Si el usuario solicita las últimas, recientes o más recientes cuentas de cobro, " +
            "utiliza idCliente y establece limite con la cantidad solicitada. " +
            "Por ejemplo, si solicita las últimas 2 cuentas, utiliza limite=2. " +
            "Si el usuario solicita todas las cuentas de cobro de un cliente, utiliza idCliente " +
            "sin establecer limite. " +
            "Si el usuario solicita una cuenta específica, utiliza idCuentaCobro. " +
            "Si proporciona tanto el cliente como una cuenta específica, utiliza ambos parámetros. " +
            "Si no se proporciona ni idCliente ni idCuentaCobro, solicita al usuario la información necesaria.",
        parametersJsonSchema: {
            type: "object",
            properties: {
                idCliente: {
                    type: "string",
                    description:
                        "ID del cliente obtenido de consulta_clientes_por_termino. " +
                        "Es opcional. Utilizarlo cuando la consulta se refiere a las cuentas de un cliente."
                },
                idCuentaCobro: {
                    type: "string",
                    description:
                        "ID o número de una cuenta de cobro específica. " +
                        "Es opcional. Utilizarlo cuando el usuario solicita una cuenta determinada."
                },
                limite: {
                    type: "integer",
                    description:
                        "Cantidad máxima de cuentas de cobro que se deben retornar. " +
                        "Utilizarlo cuando el usuario indique una cantidad específica, " +
                        "como 'las últimas 2', 'las últimas 5' o 'las 10 más recientes'. " +
                        "Si el usuario solicita 'todas', no es necesario enviar este parámetro."
                }
            },
            required: []
        }
    },
    {
        name: "crear_recordatorio",
        description:
            "Crea un nuevo recordatorio. " +
            "Utiliza esta herramienta cuando necesites crear un recordatorio para el usuario. " +
            "Si no se especifica fecha agregarlo con la fecha del día actual. " +
            contextoFecha,
        parametersJsonSchema: {
            type: "object",
            properties: {
                texto: {
                    type: "string",
                    description:"Texto del recordatorio que se desea crear."
                },
                fecha: {
                    type: "string",
                    description:"Fecha y hora del recordatorio en formato YYYY-MM-DDTHH:MM:SSZ (ej. '2003-06-09T14:30:00Z')."
                }
            },
            required: ["texto", "fecha"]
        }
    },
     {
        name: "obtener_recordatorios_por_fecha",
        description:
            "Obtiene los recordatorios del usuario. " +
            "Utiliza esta herramienta cuando necesites obtener los recordatorios creados por el usuario. " +
            "Si no se especifica fecha tomar desde el día actual hasta el día actual. " +
            contextoFecha,
        parametersJsonSchema: {
            type: "object",
            properties: {
                desde: {
                    type: "string",
                    description:"Fecha inicial de los recordatorios a buscar en formato YYYY-MM-DD. Ej. '2003-06-09'."
                },
                hasta: {
                    type: "string",
                    description:"Fecha final de los recordatorios a buscar en formato YYYY-MM-DD. Ej. '2003-06-09'."
                }
            },
            required: ["desde", "hasta"]
        }
    }
    // Agrega aquí tus tools propias siguiendo el mismo formato.
];

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
        | MENSAJES NATURALES -> AGENTE CON TOOLS
        |--------------------------------------------------------------------------
        */
        if (!texto.startsWith("/")) {
            try {
                const resultado = await ejecutarAgente(texto, chatId);
                respuesta = resultado.response;
                respuesta += `\n\n📊 Tokens usados: ${resultado.tokensUsados}`;
                respuesta += `\n📊 Tokens de entrada: ${resultado.tokensEntrada}`;
                respuesta += `\n📊 Tokens de salida: ${resultado.tokensSalida}`;
            }
            catch (err) {
                console.error("Error ejecutando el agente con Gemini:", err);
                respuesta = "❌ Ocurrió un error intentando entender tu solicitud.";
            }
        }
        /*
        |--------------------------------------------------------------------------
        | COMANDOS TRADICIONALES DE TELEGRAM (sin cambios)
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

/*
|--------------------------------------------------------------------------
| AGENTE (loop de function calling con Gemini)
|--------------------------------------------------------------------------
| Reemplaza a la vieja interpretarMensaje(). En vez de forzar un único JSON
| de salida, deja que Gemini decida libremente si necesita usar 0, 1 o
| varias tools antes de dar la respuesta final, encadenándolas si hace falta
| (ej. "dime cuánto debe el cliente X y enciende el LED del FENIXONE").
*/
const SYSTEM_INSTRUCTION = `
Eres FENIX, un asistente de IA para control de dispositivos IoT y consultas
de información empresarial (clientes SAP y otras fuentes conectadas).

Reglas:
- Si la solicitud requiere ejecutar una acción sobre un dispositivo o
  consultar datos reales (cliente, factura, inventario, etc.), usa siempre
  la tool correspondiente. Nunca inventes datos ni resultados.
- Si el usuario no menciona un dispositivo, usa "FENIXONE" por defecto.
- Si falta un dato indispensable (distinto al dispositivo) para poder usar
  una tool, pide ese dato antes de intentar llamarla.
- Responde siempre en español, de forma clara, breve y sin usar Markdown
  (el canal de salida no lo soporta).
`.trim();

const MAX_TOOL_TURNS = 5; // límite de seguridad para evitar loops infinitos

async function ejecutarAgente(texto, chatId) {
    let contents = [
        { role: "user", parts: [{ text: texto }] },
    ];
    let tokensUsados = 0;
    let tokensEntrada = 0;
    let tokensSalida = 0;

    for (let turno = 0; turno < MAX_TOOL_TURNS; turno++) {
       const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ functionDeclarations: toolDeclarations }],
            },
        });

        const usage = response.usageMetadata;

        console.error("====================================");
        console.error("FENIX - TURNO:", turno + 1);
        console.error("Tokens entrada :", usage?.promptTokenCount || 0);
        console.error("Tokens salida  :", usage?.candidatesTokenCount || 0);
        console.error("Tokens total   :", usage?.totalTokenCount || 0);
        console.error("====================================");

        tokensUsados += usage?.totalTokenCount || 0;
        tokensEntrada += usage?.promptTokenCount || 0;
        tokensSalida += usage?.candidatesTokenCount || 0;

        const llamadas = response.functionCalls;
        if (!llamadas || llamadas.length === 0) {
            // Respuesta final en texto plano, sin más tools que ejecutar
            return { response: response.text || "", tokensUsados, tokensEntrada, tokensSalida };
        }

        // Guarda el turno del modelo (con las function calls) en el historial
        contents.push({
            role: "model",
            parts: response.candidates[0].content.parts,
        });

        // Ejecuta cada tool solicitada y arma las function responses
        const parts = [];
        for (const llamada of llamadas) {
            console.log("Tool solicitada:", llamada.name, llamada.args);
            let resultado;
            try {
                resultado = await executeTool(llamada.name, llamada.args, chatId);
            } catch (err) {
                resultado = { error: err.message };
            }
            parts.push({
                functionResponse: {
                    name: llamada.name,
                    response: { result: resultado },
                },
            });
        }
        contents.push({ role: "user", parts });
        // el loop vuelve a llamar a Gemini con el resultado ya insertado
    }

    return {
        response: "❌ El agente no pudo completar la solicitud en un número razonable de pasos.",
        tokensUsados,
        tokensEntrada,
        tokensSalida
    };
}

/*
|--------------------------------------------------------------------------
| EJECUCIÓN REAL DE CADA TOOL
|--------------------------------------------------------------------------
*/
async function executeTool(name, args, chatId) {
    switch (name) {
        case "controlar_dispositivo": {
            const device = args.device || "FENIXONE";
            await insertarComando(device, args.command, args.value ?? null);
            return {
                ok: true,
                mensaje: `Comando '${args.command}' enviado a ${device}`,
            };
        }

        case "consultar_cuentas_banco": {
            const response = await axios.post(
                "https://project.wannabe.com.co/Gestion/getCuentasBanco",
                {}, 
                {
                    headers: {
                        Authorization: "Bearer " + TOKEN_API_WANNABE,
                    }
                }
            );
            return { ok: true, cuentas: response.data };
        }        
        
        case "ganancias_por_ano": {
            const response = await axios.post(
                "https://project.wannabe.com.co/Api/gananciasPorAnio",
                {}, //payload
                {
                    headers: {
                        Authorization: "Bearer " + TOKEN_API_WANNABE,
                    }
                }
            );
            return { ok: true, cuentas: response.data };
        }  
        case "ganancias_totales_empresa": {
            const response = await axios.post(
                "https://project.wannabe.com.co/Api/gananciasPorAnio",
                {}, //payload
                {
                    headers: {
                        Authorization: "Bearer " + TOKEN_API_WANNABE,
                    }
                }
            );
            return { ok: true, cuentas: response.data };
        }    
        case "consulta_clientes_por_termino": {
            const termino = encodeURIComponent(args.termino);
            const response = await axios.post(
                `https://project.wannabe.com.co/Api/getClientesPorBusqueda/${termino}`,
                {}, //payload
                {
                    headers: {
                        Authorization: "Bearer " + TOKEN_API_WANNABE,
                    }
                }
            );
            return { ok: true, cuentas: response.data };
        }  
        
        case "app": {
            const termino = encodeURIComponent(args.termino);
            const response = await axios.post(
                `https://project.wannabe.com.co/Api/getClientesPorBusqueda/${termino}`,
                {},
                {
                    headers: {
                        Authorization: "Bearer " + TOKEN_API_WANNABE,
                    }
                }
            );
            const datos = response.data?.datos || [];
            // No se encontró ningún cliente
            if (datos.length === 0) {
                return {
                    ok: false,
                    encontrado: false,
                    mensaje: "No se encontró ningún cliente con el término indicado."
                };
            }
            // Se encontró un único cliente
            if (datos.length === 1) {
                return {
                    ok: true,
                    encontrado: true,
                    idCliente: datos[0].idCliente
                };
            }
            // Se encontraron varios clientes
            return {
                ok: false,
                encontrado: true,
                multiples: true,
                mensaje: "Se encontraron varios clientes que coinciden con el término.",
                clientes: datos.map(cliente => ({
                    idCliente: cliente.idCliente,
                    nombreCliente: cliente.nombreCliente
                }))
            };
        }

         case "consulta_cuentas_cobro": {
            console.error("args.idCliente", args.idCliente);
            console.error("args.idCuentaCobro", args.idCuentaCobro);
            const response = await axios.post(
                `https://project.wannabe.com.co/Api/cuentasCobro/${args.idCliente}/${args.idCuentaCobro}/${args.limite}`,
                {}, //payload
                {
                    headers: {
                        Authorization: "Bearer " + TOKEN_API_WANNABE,
                    }
                }
            );
            return { ok: true, cuentas: response.data };
        }

        case "buscar_repositorio_github": {
            const repos = await obtenerReposDeGithub();

            const termino = args.busqueda.toLowerCase();
            const coincidencias = repos.filter((r) =>
                r.name.toLowerCase().includes(termino)
            );

            if (coincidencias.length === 0) {
                return { ok: false, mensaje: `No encontré ningún repositorio que coincida con "${args.busqueda}"` };
            }

            return {
                ok: true,
                repositorios: coincidencias.map((r) => ({
                    name: r.name,
                    full_name: r.full_name,
                    descripcion: r.description,
                    ultima_actualizacion: r.updated_at,
                })),
            };
        }

        case "consultar_ultimo_commit": {
            const response = await axios.get(
                `https://api.github.com/repos/${args.repo}/commits`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                        Accept: "application/vnd.github+json",
                    },
                    params: {
                        per_page: 1,
                        sha: args.branch || "main",
                        author: args.autor || undefined,
                    },
                }
            );

            const commit = response.data[0];
            if (!commit) {
                return { ok: false, mensaje: "No se encontraron commits" };
            }

            return {
                ok: true,
                commit: {
                    mensaje: commit.commit.message,
                    autor: commit.commit.author.name,
                    fecha: commit.commit.author.date,
                    sha: commit.sha.substring(0, 7),
                    url: commit.html_url,
                },
            };
        }

        case "crear_recordatorio": {
            const response = await supabase
                .from('recordatorios')
                .insert([
                    {
                        telegram_chat_id: chatId,
                        texto: args.texto,
                        fecha: args.fecha || new Date().toISOString(),
                    }
                ]);

            if (response.error) {
                console.error("Error al crear recordatorio:", response.error);
                return { ok: false, mensaje: "Error al crear el recordatorio "+response.error };
            }

            return { ok: true, mensaje: "Recordatorio creado exitosamente" };
        }
        case "obtener_recordatorios_por_fecha": {
            const { desde, hasta } = args;

            if (!desde || !hasta) {
                return { ok: false, mensaje: "Debes indicar 'desde' y 'hasta'" };
            }

            const response = await supabase
                .from('recordatorios')
                .select("texto, fecha")
                .eq('telegram_chat_id', chatId)
                .gte('fecha', desde)
                .lte('fecha', hasta);

            if (response.error) {
                console.error("Error al obtener recordatorios:", response.error);
                return { ok: false, mensaje: "Error al obtener los recordatorios " + response.error };
            }

            return { ok: true, recordatorios: response.data };
        }

        // Agrega aquí el case de cada tool nueva que declares arriba.

        default:
            return { ok: false, mensaje: `Tool desconocida: ${name}` };
    }
}

/*
|--------------------------------------------------------------------------
| GITHUB: listado de repos con caché en memoria
|--------------------------------------------------------------------------
| Evita golpear la API de GitHub (y su límite de rate) en cada mensaje.
| El listado de repos rara vez cambia, así que lo refrescamos cada 10 min.
*/
let reposCache = { data: null, expira: 0 };
const REPOS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

async function obtenerReposDeGithub() {
    if (reposCache.data && Date.now() < reposCache.expira) {
        return reposCache.data;
    }

    // /user/repos usa el token autenticado para saber de quién listar los
    // repos (incluye públicos y privados), sin necesidad de pasar el username.
    const response = await axios.get(
        "https://api.github.com/user/repos",
        {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                Accept: "application/vnd.github+json",
            },
            params: { per_page: 100, affiliation: "owner" },
        }
    );

    reposCache = {
        data: response.data,
        expira: Date.now() + REPOS_CACHE_TTL_MS,
    };
    return response.data;
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