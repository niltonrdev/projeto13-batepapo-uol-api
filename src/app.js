import express from "express"
import cors from "cors"
import { MongoClient, ObjectId } from "mongodb"
import dotenv from "dotenv"
import Joi from "joi"
import dayjs from "dayjs"

const app = express();
app.use(cors())
app.use(express.json())
dotenv.config()

const date = dayjs().format("hh:mm:ss")

//conexão com o banco
const mongoClient = new MongoClient(process.env.DATABASE_URL)
let db

mongoClient.connect()
    .then(() => db = mongoClient.db())
    .catch((err) => console.log(err.message))


//funções
app.post("/participants", async (req, res) => {
    const { name } = req.body
    const participantSchema = Joi.object({
        name: Joi.string().required()
    })

    const validation = participantSchema.validate({ name })
    console.log(validation)

    if (validation.error) return res.status(422).send(validation.error.details)

    try {

        const nameExist = await db.collection("participants").findOne({ name })

        if (nameExist) return res.status(409).send("Usuário já cadastrado")

        await db.collection("participants").insertOne({ name, lastStatus: Date.now() })

        await db.collection("messages").insertOne(
            {
                from: name,
                to: "Todos",
                text: "entra na sala...",
                type: "status",
                time: date
            })

        res.status(201).send("Usuário criado")

    } catch (err) {
        res.status(500).send(err.message)
    }

})

app.get("/participants", async (req, res) => {

    try {
        const participants = await db.collection("participants").find().toArray()
        res.send(participants)
    } catch (err) {
        res.status(500).send(err.message)
    }
})

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body
    const { user } = req.headers
    console.log(user)

    const messageSchema = Joi.object({
        from: Joi.string().required(),
        to: Joi.string().required(),
        text: Joi.string().required(),
        type: Joi.string().valid('message', 'private_message').required()
    })
    const validation = messageSchema.validate({ to, text, type, from: user }, { abortEarly: false })
    console.log(validation)

    if (validation.error) {
        const errors = validation.error.details.map((err) => {
            return err.message
        })
        return res.status(422).send(errors)
    }

    try {

        let nameExist = await db.collection("participants").findOne({ name: user })
        console.log(nameExist)
        if (!nameExist) return res.status(422).send("Usuário não esta na sala de participantes")

        await db.collection("messages").insertOne({
            from: user,
            to,
            text,
            type,
            time: date
        })
        res.status(201).send("Mensagem enviada")


    } catch (err) {
        return res.status(500).send(console.log(err))
    }

})

app.get("/messages", async (req, res) => {

    let { user } = req.headers
    let limit
    const messages = await db.collection("messages").find().toArray()

    if (req.query.limit) {
        limit = parseInt(req.query.limit);
        if (limit < 1 || isNaN(limit)) {
            res.status(422).send("Limite inválido")
            return
        }
    }
    let visibleMessages = messages.filter((m) =>
        m.user === user ||
        m.type === 'message' ||
        m.to === user && m.type === 'private_message' ||
        m.from === user && m.type === 'private_message' ||
        m.type === 'status'
    )
    res.send(visibleMessages.splice(-limit))
})

app.post("/status", async (req, res) => {
    //Deve receber por um header na requisição, chamado User, contendo o nome do participante a ser atualizado.
    let { user } = req.headers

    if (!user) return res.sendStatus(404)

    let nameExist = await db.collection("participants").findOne({ name: user })

    if (!nameExist) return res.sendStatus(404)

    //Atualizar o atributo lastStatus do participante informado para o timestamp atual, utilizando Date.now().
    await db.collection("participants").updateOne(
        { name: user },
        { $set: { name: user, lastStatus: Date.now() } }
    )
    //caso sucesso status 200
    res.status(200).send("Participante atualizado")
})

 setInterval(async () => {
     let participants = await db.collection("participants").find({ lastStatus: { $lte: Date.now() - 10000 } }).toArray()

     participants.forEach(async p => {
         await db.collection("participants").deleteOne({ name: p.name })

         await db.collection("messages").insertOne(
             {
                 from: p.name,
                 to: "Todos",
                 text: "sai da sala...",
                 type: "status",
                 time: date
             })
     })

 }, 15000)

app.delete("/messages/:id", async (req, res) => {
    const { id } = req.params
    const { user } = req.headers

    if (!user) return res.sendStatus(404)

    let nameExist = await db.collection("participants").findOne({ name: user })
    if (!nameExist) return res.sendStatus(404)

    const messageId = await db.collection("messages").findOne({ _id: new ObjectId(id) })
    if (!messageId) return res.sendStatus(404)

    if (messageId && (user === messageId.from)) {
        await db.collection("messages").deleteOne({ _id: new ObjectId(id) })
        res.status(200).send("Mensagem deletada!")
    } else {
        res.sendStatus(401)
    }

})

app.put("/messages/:id", async (req, res) => {

    const { to, text, type } = req.body
    const { user } = req.headers
    const { id } = req.params

    const messageSchema = Joi.object({
        from: Joi.string().required(),
        to: Joi.string().required(),
        text: Joi.string().required(),
        type: Joi.string().valid('message', 'private_message').required()
    })
    const validation = messageSchema.validate({ to, text, type, from: user }, { abortEarly: false })
    console.log(validation)

    if (validation.error) {
        const errors = validation.error.details.map((err) => {
            return err.message
        })
        return res.status(422).send(errors)
    }

    let nameExist = await db.collection("participants").findOne({ name: user })
    if (!nameExist) return res.sendStatus(404)

    const messageId = await db.collection("messages").findOne({ _id: new ObjectId(id) })
    if (!messageId) return res.sendStatus(404)

    if (messageId && (user === messageId.from)) {
        await db.collection("messages").updateOne(
            { _id: new ObjectId(id) },
            { $set: {to, text, type} }
            )
        res.status(200).send("Mensagem atualizada!")
    } else {
        res.sendStatus(401)
    }


 })


    //Ligar a aplicação do servidor para ouvir requisições
    const PORT = 5000;
    app.listen(PORT, () => console.log(`Servidor iniciado na porta ${PORT}`))