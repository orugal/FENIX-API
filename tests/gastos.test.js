const assert = require("assert");

function createMockSupabase() {
    let mockStore = [];

    return {
        from: (table) => {
            let filterChatId = null;
            let filterGastoIlike = null;
            let filterGteFecha = null;
            let filterLteFecha = null;
            let filterEqId = null;

            const builder = {
                insert: (rows) => {
                    const inserted = rows.map((r, i) => ({
                        id: mockStore.length + i + 1,
                        ...r,
                        created_at: new Date().toISOString()
                    }));
                    mockStore.push(...inserted);
                    return {
                        select: (fields) => {
                            return Promise.resolve({
                                data: inserted,
                                error: null
                            });
                        }
                    };
                },
                select: (fields) => {
                    return builder;
                },
                delete: () => {
                    return builder;
                },
                eq: (column, value) => {
                    if (column === "telegram_chat_id") filterChatId = value;
                    if (column === "id") filterEqId = value;
                    return builder;
                },
                ilike: (column, pattern) => {
                    if (column === "gasto") {
                        filterGastoIlike = pattern.replace(/%/g, "").toLowerCase();
                    }
                    return builder;
                },
                gte: (column, value) => {
                    if (column === "fecha") filterGteFecha = value;
                    return builder;
                },
                lte: (column, value) => {
                    if (column === "fecha") filterLteFecha = value;
                    return builder;
                },
                order: (column, opts) => {
                    return builder;
                },
                then: (resolve) => {
                    let filtered = mockStore.filter(item => item.telegram_chat_id === filterChatId);
                    if (filterEqId) {
                        filtered = filtered.filter(item => item.id === filterEqId);
                    }
                    if (filterGastoIlike) {
                        filtered = filtered.filter(item => item.gasto.toLowerCase().includes(filterGastoIlike));
                    }
                    if (filterGteFecha) {
                        filtered = filtered.filter(item => item.fecha >= filterGteFecha);
                    }
                    if (filterLteFecha) {
                        filtered = filtered.filter(item => item.fecha <= filterLteFecha);
                    }

                    // Si la llamada proviene de un delete
                    if (builder._isDelete) {
                        mockStore = mockStore.filter(item => !filtered.includes(item));
                    }

                    resolve({
                        data: filtered,
                        error: null
                    });
                }
            };

            return builder;
        },
        _getStore: () => mockStore
    };
}

async function runTests() {
    console.log("🧪 Ejecutando pruebas unitarias para gestión de gastos personales...");

    const mockSupabase = createMockSupabase();
    const chatId = 987654321;

    // Functions simulating executeTool handlers
    async function executeAgregarGasto(args) {
        const { gasto, valor, fecha } = args;
        if (!gasto || valor === undefined || valor === null) {
            return { ok: false, mensaje: "Debes proporcionar 'gasto' y 'valor'." };
        }
        const fechaGasto = fecha || "2025-08-15";
        const response = await mockSupabase
            .from("gastos")
            .insert([{ telegram_chat_id: chatId, gasto: String(gasto).trim(), valor: Number(valor), fecha: fechaGasto }])
            .select("id, gasto, valor, fecha");

        return {
            ok: true,
            mensaje: "Gasto registrado exitosamente",
            registro: response.data[0],
        };
    }

    async function executeConsultarGastos(args = {}) {
        const { gasto, desde, hasta } = args;
        let query = mockSupabase
            .from("gastos")
            .select("id, gasto, valor, fecha, created_at")
            .eq("telegram_chat_id", chatId)
            .order("fecha", { ascending: true });

        if (gasto) query = query.ilike("gasto", `%${gasto.trim()}%`);
        if (desde) query = query.gte("fecha", desde);
        if (hasta) query = query.lte("fecha", hasta);

        const response = await query;
        const totalMonto = (response.data || []).reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

        return {
            ok: true,
            totalRegistros: response.data ? response.data.length : 0,
            totalMonto: totalMonto,
            gastos: response.data || [],
        };
    }

    async function executeBorrarGasto(args = {}) {
        const { id, gasto } = args;
        if (!id && !gasto) {
            return { ok: false, mensaje: "Debes especificar al menos el 'id' o el nombre del 'gasto' a eliminar." };
        }

        let query = mockSupabase
            .from("gastos")
            .delete()
            .eq("telegram_chat_id", chatId);

        query._isDelete = true;

        if (id) {
            query = query.eq("id", id);
        } else if (gasto) {
            query = query.ilike("gasto", `%${gasto.trim()}%`);
        }

        const response = await query;

        if (!response.data || response.data.length === 0) {
            return { ok: false, mensaje: "No se encontró ningún gasto que coincida con los criterios." };
        }

        return {
            ok: true,
            mensaje: `Se eliminaron ${response.data.length} registro(s) de gastos.`,
            eliminados: response.data,
        };
    }

    // Test 1: Registrar gastos
    console.log("1️⃣ Test: Registrar varios gastos con fechas distintas");
    const g1 = await executeAgregarGasto({ gasto: "Gasolina", valor: 50000, fecha: "2025-08-05" });
    const g2 = await executeAgregarGasto({ gasto: "Gasolina", valor: 60000, fecha: "2025-08-20" });
    const g3 = await executeAgregarGasto({ gasto: "Restaurante", valor: 85000, fecha: "2025-08-15" });
    const g4 = await executeAgregarGasto({ gasto: "Mercado", valor: 200000, fecha: "2025-09-01" });

    assert.strictEqual(g1.ok, true);
    assert.strictEqual(g1.registro.gasto, "Gasolina");

    // Test 2: Consultar todos los gastos de agosto
    console.log("2️⃣ Test: Consultar todos los gastos del mes de agosto (2025-08-01 a 2025-08-31)");
    const resAgosto = await executeConsultarGastos({ desde: "2025-08-01", hasta: "2025-08-31" });
    assert.strictEqual(resAgosto.ok, true);
    assert.strictEqual(resAgosto.totalRegistros, 3);
    assert.strictEqual(resAgosto.totalMonto, 195000);

    // Test 3: Consultar gasto específico por nombre ("gasolina")
    console.log("3️⃣ Test: Consultar cuánto se gastó en 'gasolina'");
    const resGasolina = await executeConsultarGastos({ gasto: "gasolina" });
    assert.strictEqual(resGasolina.ok, true);
    assert.strictEqual(resGasolina.totalRegistros, 2);
    assert.strictEqual(resGasolina.totalMonto, 110000);

    // Test 4: Borrar gasto por nombre ("Restaurante")
    console.log("4️⃣ Test: Borrar gasto por concepto ('Restaurante')");
    const resBorrarRest = await executeBorrarGasto({ gasto: "Restaurante" });
    assert.strictEqual(resBorrarRest.ok, true);
    assert.strictEqual(resBorrarRest.eliminados.length, 1);

    // Test 5: Borrar gasto por ID
    console.log("5️⃣ Test: Borrar gasto por ID");
    const resBorrarId = await executeBorrarGasto({ id: g1.registro.id });
    assert.strictEqual(resBorrarId.ok, true);
    assert.strictEqual(resBorrarId.eliminados[0].id, g1.registro.id);

    // Test 6: Verificar estado final
    console.log("6️⃣ Test: Verificar gastos restantes");
    const resFinal = await executeConsultarGastos();
    assert.strictEqual(resFinal.totalRegistros, 2); // Quedaron 1 gasolina y 1 mercado

    console.log("✅ Todas las pruebas unitarias de gastos pasaron exitosamente.");
}

runTests().catch((err) => {
    console.error("❌ Error en las pruebas de gastos:", err);
    process.exit(1);
});
