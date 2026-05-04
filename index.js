// ===============================
// NTCG BANK BOT — ONE FILE VERSION
// ===============================

const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Collection, 
  REST, 
  Routes 
} = require("discord.js");
const fs = require("fs");
require("dotenv").config();

// ===============================
// CONFIG
// ===============================

// REMPLACE PAR TES IDS
const ROLE_BANK = process.env.ROLE_BANK;
const ROLE_DIRECTION = process.env.ROLE_DIRECTION;
const CHANNEL_ARRIVEES = process.env.CHANNEL_ARRIVEES;
const CHANNEL_DEPARTS = process.env.CHANNEL_DEPARTS;

// ===============================
// BASE DE DONNÉES JSON
// ===============================

if (!fs.existsSync("./accounts.json")) fs.writeFileSync("./accounts.json", "{}");
if (!fs.existsSync("./revenues.json")) fs.writeFileSync("./revenues.json", "{}");

let accounts = require("./accounts.json");
let revenues = require("./revenues.json");

// ===============================
// FONCTIONS BANCAIRES
// ===============================

function generateCardNumber() {
  return Array(4).fill(0).map(() =>
    Math.floor(1000 + Math.random() * 9000)
  ).join(" ");
}

function generateCVV() {
  return Math.floor(100 + Math.random() * 900).toString();
}

function generateValidThru() {
  const year = 26 + Math.floor(Math.random() * 5);
  const month = ("0" + Math.floor(1 + Math.random() * 11)).slice(-2);
  return `${month}/${year}`;
}

function saveAccounts() {
  fs.writeFileSync("./accounts.json", JSON.stringify(accounts, null, 2));
}

function saveRevenues() {
  fs.writeFileSync("./revenues.json", JSON.stringify(revenues, null, 2));
}

// ===============================
// CLIENT DISCORD
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.User, Partials.GuildMember]
});

// ===============================
// SLASH COMMANDS
// ===============================

const commands = [
  {
    name: "create-account",
    description: "Créer un compte bancaire RP",
    options: [
      {
        name: "user",
        description: "Utilisateur",
        type: 6,
        required: true
      },
      {
        name: "type",
        description: "Type de carte",
        type: 3,
        required: true,
        choices: [
          { name: "Cheap", value: "CHEAP" },
          { name: "Standard", value: "STANDARD" },
          { name: "Premium", value: "PREMIUM" },
          { name: "Gold", value: "GOLD" },
          { name: "Black", value: "BLACK" },
          { name: "Diamond VIP", value: "DIAMOND_VIP" }
        ]
      }
    ]
  },
  {
    name: "view-card",
    description: "Voir la carte bancaire d'un utilisateur",
    options: [
      {
        name: "user",
        description: "Utilisateur",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "add-revenue",
    description: "Ajouter un revenu à l'entreprise",
    options: [
      {
        name: "amount",
        description: "Montant",
        type: 4,
        required: true
      },
      {
        name: "source",
        description: "Source du revenu",
        type: 3,
        required: true
      }
    ]
  }
];

// ===============================
// DEPLOIEMENT DES COMMANDES
// ===============================

client.once("ready", async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash commands enregistrées.");
});

// ===============================
// ARRIVÉES / DÉPARTS
// ===============================

client.on("guildMemberAdd", member => {
  const ch = member.guild.channels.cache.get(CHANNEL_ARRIVEES);
  if (ch) ch.send(`📥 **Arrivée :** ${member.user.tag}`);
});

client.on("guildMemberRemove", member => {
  const ch = member.guild.channels.cache.get(CHANNEL_DEPARTS);
  if (ch) ch.send(`📤 **Départ :** ${member.user.tag}`);
});

// ===============================
// GESTION DES COMMANDES
// ===============================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ============================
  // /create-account
  // ============================
  if (interaction.commandName === "create-account") {
    const staff = interaction.member;
    const target = interaction.options.getUser("user");
    const type = interaction.options.getString("type");

    if (!staff.roles.cache.has(ROLE_BANK) && !staff.roles.cache.has(ROLE_DIRECTION))
      return interaction.reply({ content: "Tu n'as pas la permission.", ephemeral: true });

    const member = await interaction.guild.members.fetch(target.id);
    const joinDays = (Date.now() - member.joinedAt) / (1000 * 60 * 60 * 24);

    if (type !== "DIAMOND_VIP" && joinDays < 7)
      return interaction.reply({ content: "Le joueur n'a pas 7 jours d'ancienneté.", ephemeral: true });

    const card = {
      number: generateCardNumber(),
      cvv: generateCVV(),
      valid: generateValidThru(),
      type
    };

    accounts[target.id] = {
      userId: target.id,
      createdAt: Date.now(),
      card
    };

    saveAccounts();

    return interaction.reply({
      content:
        `Compte créé pour **${target.username}**.\n` +
        `Type : **${type}**\n` +
        `Numéro : **${card.number}**\n` +
        `CVV : **${card.cvv}**\n` +
        `Validité : **${card.valid}**`,
      ephemeral: true
    });
  }

  // ============================
  // /view-card
  // ============================
  if (interaction.commandName === "view-card") {
    const target = interaction.options.getUser("user");

    const data = accounts[target.id];
    if (!data) return interaction.reply({ content: "Aucun compte trouvé.", ephemeral: true });

    return interaction.reply({
      content:
        `**Carte de ${target.username}**\n` +
        `Type : ${data.card.type}\n` +
        `Numéro : ${data.card.number}\n` +
        `CVV : ${data.card.cvv}\n` +
        `Validité : ${data.card.valid}`,
      ephemeral: true
    });
  }

  // ============================
  // /add-revenue
  // ============================
  if (interaction.commandName === "add-revenue") {
    const amount = interaction.options.getInteger("amount");
    const source = interaction.options.getString("source");

    const month = new Date().toISOString().slice(0, 7);

    if (!revenues[month]) revenues[month] = { total: 0, details: [] };

    revenues[month].total += amount;
    revenues[month].details.push({ source, amount });

    saveRevenues();

    return interaction.reply({
      content: `Revenu ajouté : **${amount}€** (${source})`,
      ephemeral: true
    });
  }
});

// ===============================
// LOGIN
// ===============================

client.login(process.env.TOKEN);
