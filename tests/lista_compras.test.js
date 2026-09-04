const assert = require("assert");

// Simulación de respuesta y comportamiento de Supabase para las pruebas
function createMockSupabase() {
    let mockStore = [];

    return {
        from: (table) => {
            let currentData = [...mockStore];
            let filterChatId = null;
            let filterInProducts = null;

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
                                data: inserted.map(item => ({ producto: item.producto })),
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
                    if (column === "telegram_chat_id") {
                        filterChatId = value;
                    }
                    return builder;
                },
                in: (column, values) => {
                    if (column === "producto") {
                        filterInProducts = values;
                    }
                    return builder;
                },
                order: (column, opts) => {
                    let filtered = mockStore.filter(item => item.telegram_chat_id === filterChatId);
                    return Promise.resolve({
                        data: filtered,
                        error: null
                    });
                },
                then: (resolve) => {
                    // Si llega aquí desde delete() con .select()
                    let toDelete = mockStore.filter(item => item.telegram_chat_id === filterChatId);
                    if (filterInProducts) {
                        toDelete = toDelete.filter(item => filterInProducts.includes(item.producto));
                    }

                    // Remueve de mockStore
                    mockStore = mockStore.filter(item => !toDelete.includes(item));

                    resolve({
                        data: toDelete.map(item => ({ producto: item.producto })),
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
    console.log("🧪 Ejecutando pruebas unitarias para lista de compras...");

    const mockSupabase = createMockSupabase();
    const chatId = 12345678;

    // Helper functions simulando la lógica de las tools en webhookTelegramIAController.js
    async function executeAgregar(args) {
        const { productos } = args;
        if (!productos || !Array.isArray(productos) || productos.length === 0) {
            return { ok: false, mensaje: "Debes proporcionar al menos un producto." };
        }
        const filas = productos.map((p) => ({
            telegram_chat_id: chatId,
            producto: String(p).trim(),
            comprado: false,
        }));
        const response = await mockSupabase.from("lista_compras").insert(filas).select("producto");
        return {
            ok: true,
            mensaje: `Se agregaron ${response.data.length} producto(s) a la lista de compras.`,
            productos: response.data.map((item) => item.producto),
        };
    }

    async function executeVer() {
        const response = await mockSupabase
            .from("lista_compras")
            .select("id, producto, comprado, created_at")
            .eq("telegram_chat_id", chatId)
            .order("created_at", { ascending: true });

        return {
            ok: true,
            total: response.data.length,
            productos: response.data,
        };
    }

    async function executeBorrar(args = {}) {
        const { productos } = args;
        let query = mockSupabase
            .from("lista_compras")
            .delete()
            .eq("telegram_chat_id", chatId);

        if (productos && Array.isArray(productos) && productos.length > 0) {
            const prodsLimpios = productos.map((p) => String(p).trim());
            query = query.in("producto", prodsLimpios);
        }

        const response = await query;

        if (!response.data || response.data.length === 0) {
            return { ok: false, mensaje: "No se encontró ningún producto para eliminar." };
        }

        return {
            ok: true,
            mensaje: `Se eliminaron ${response.data.length} producto(s) de la lista de compras.`,
            eliminados: response.data.map((item) => item.producto),
        };
    }

    // Test 1: Agregar productos varios
    console.log("1️⃣ Test: Agregar múltiples productos en una sola petición");
    const resAgregar = await executeAgregar({ productos: ["pan", "leche", "huevos", "arroz"] });
    assert.strictEqual(resAgregar.ok, true);
    assert.strictEqual(resAgregar.productos.length, 4);
    assert.deepStrictEqual(resAgregar.productos, ["pan", "leche", "huevos", "arroz"]);

    // Test 2: Ver lista de compras
    console.log("2️⃣ Test: Ver lista de compras");
    const resVer = await executeVer();
    assert.strictEqual(resVer.ok, true);
    assert.strictEqual(resVer.total, 4);

    // Test 3: Borrar producto específico
    console.log("3️⃣ Test: Borrar producto específico ('leche')");
    const resBorrarUno = await executeBorrar({ productos: ["leche"] });
    assert.strictEqual(resBorrarUno.ok, true);
    assert.strictEqual(resBorrarUno.eliminados.length, 1);
    assert.deepStrictEqual(resBorrarUno.eliminados, ["leche"]);

    // Test 4: Ver lista tras borrar un producto
    console.log("4️⃣ Test: Ver lista tras borrar 'leche'");
    const resVerDos = await executeVer();
    assert.strictEqual(resVerDos.total, 3);

    // Test 5: Borrar toda la lista de compras
    console.log("5️⃣ Test: Borrar toda la lista de compras");
    const resBorrarTodo = await executeBorrar();
    assert.strictEqual(resBorrarTodo.ok, true);
    assert.strictEqual(resBorrarTodo.eliminados.length, 3);

    // Test 6: Ver lista vacía
    console.log("6️⃣ Test: Ver lista cuando está vacía");
    const resVerVacia = await executeVer();
    assert.strictEqual(resVerVacia.total, 0);

    console.log("✅ Todas las pruebas unitarias pasaron exitosamente.");
}

runTests().catch((err) => {
    console.error("❌ Error en las pruebas:", err);
    process.exit(1);
});
