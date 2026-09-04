const db = require("../database/database");

exports.getCommands = async (req, res) => {

    try {

        const device = req.query.device;

        if (!device) {

            return res.status(400).json({
                success: false,
                message: "Debe enviar el parámetro device"
            });

        }

        const [commands] = await db.execute(

            `SELECT
                id,
                command,
                value,
                created_at
             FROM commands
             WHERE device = ?
             AND executed = 0
             ORDER BY id`,

            [device]

        );

        res.json({

            success: true,
            device,
            commands

        });

    }
    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

};



exports.postCommand = async (req, res) => {

    try {

        const {

            device,
            command,
            value

        } = req.body;

        if (!device || !command) {

            return res.status(400).json({

                success: false,
                message: "Datos incompletos"

            });

        }

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

        res.json({

            success: true,
            id: result.insertId

        });

    }
    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

};



exports.doneCommand = async (req, res) => {

    try {

        await db.execute(

            `UPDATE commands
             SET executed = 1
             WHERE id = ?`,

            [

                req.params.id

            ]

        );

        res.json({

            success: true

        });

    }
    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

};