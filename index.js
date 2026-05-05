const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");

// ============================
// CONFIG
// ============================
const TOKEN = process.env.TOKEN;

// Rôles autorisés
const ROLE_BANK = "1500319763157487778";
const ROLE_BIJOUTERIE = "1501255703384559679";
const ROLE_TRANSPORT = "1500319754815012936";

// ============================
// CARTES NTCG (6 types)
// ============================
const CARD_IMAGES = {
  DIAMOND: "https://copilot.microsoft.com/th/id/BCO.388d0723-b9a4-4c7a-854b-59dfcb16ecfc.png",
  BLACK: "https://copilot.microsoft.com/th/id/BCO.5c8f0371-eb82-4d34-9bcb-1f68f4220ddb.png",
  GOLD: "https://copilot.microsoft.com/th/id/BCO.443427c9-2501-406f-a210-2051c37ace66.png",
  PREMIUM: "https://copilot.microsoft.com/th/id/BCO.3603fe52-b67e-4e81-bec3-17079e036349.png",
  STANDARD: "https://copilot.microsoft.com/th/id/BCO.89fb572a-1972-4003-897a-1cbac0105533.png",
  BASIC: "https://copilot.microsoft.com/th/id/BCO.f70d2e18-42bb-4a88-8692-03f8ab4533cf.png"
};

const CARD_TYPES = Object.keys(CARD_IMAGES);

// ============================
// CLIENT
// ============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember, Partials.User]
});

// ============================
// DATA (accounts + revenues)
// ============================
let accounts = {};
let revenues = {};

// Chargement des comptes
try {
  accounts = JSON.parse(fs.readFileSync("./accounts.json", "utf8"));
} catch {
  accounts = {};
}

// Chargement des revenus
try {
  revenues = JSON.parse(fs.readFileSync("./revenues.json", "utf8"));
} catch {
  revenues = {
    totals: {
      BANK: 0,
      BIJOUTERIE: 0,
      TRANSPORT: 0
    },
    history: []
  };
}

// Sauvegarde des comptes
function saveAccounts() {
  fs.writeFileSync("./accounts.json", JSON.stringify(accounts, null, 2));
}

// Sauvegarde des revenus
function saveRevenues() {
  fs.writeFileSync("./revenues.json", JSON.stringify(revenues, null, 2));
}

// ============================
// STYLE EMBEDS (Style A Cyber Blue Premium)
// ============================
function baseEmbed() {
  return new EmbedBuilder()
    .setColor(0x3498db) // Bleu premium
    .setFooter({ text: "NTCG Bank • Système bancaire RP" })
    .setTimestamp();
}

// ============================
// GÉNÉRATION DES CARTES
// ============================

// Numéro de carte (commence par 4, 16 chiffres)
function generateCardNumber() {
  return "4" + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join("");
}

// CVV (3 chiffres)
function generateCVV() {
  return String(Math.floor(100 + Math.random() * 900));
}

// Validité (MM/YY) +3 ans
function generateValidThru() {
  const now = new Date();
  const year = now.getFullYear() + 3;
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${month}/${String(year).slice(-2)}`;
}

// ============================
// SLASH COMMANDS
// ============================
const commands = [
  {
    name: "create-account",
    description: "Créer un compte bancaire (1 seul par joueur)",
    options: [
      {
        name: "user",
        description: "Joueur cible",
        type: 6, // USER
        required: true
      },
      {
        name: "type",
        description: "Type de carte NTCG",
        type: 3, // STRING
        required: true,
        choices: CARD_TYPES.map(t => ({ name: t, value: t }))
      }
    ]
  },

  {
    name: "account",
    description: "Voir une carte bancaire",
    options: [
      {
        name: "user",
        description: "Joueur cible (laisser vide pour soi-même)",
        type: 6,
        required: false
      }
    ]
  },

  {
    name: "add-revenue",
    description: "Ajouter un revenu à un secteur",
    options: [
      {
        name: "sector",
        description: "Secteur concerné",
        type: 3,
        required: true,
        choices: [
          { name: "BANK", value: "BANK" },
          { name: "BIJOUTERIE", value: "BIJOUTERIE" },
          { name: "TRANSPORT", value: "TRANSPORT" }
        ]
      },
      {
        name: "amount",
        description: "Montant du revenu",
        type: 4, // INTEGER
        required: true
      },
      {
        name: "reason",
        description: "Raison du revenu",
        type: 3,
        required: false
      }
    ]
  },

  {
    name: "revenue-history",
    description: "Voir l'historique des revenus"
  },

  {
    name: "bank-stats",
    description: "Voir les statistiques globales des revenus"
  }
];

// ============================
// READY + ENREGISTREMENT DES COMMANDES
// ============================
client.once("ready", async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("Slash commands enregistrées.");
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des commandes :", error);
  }
});

// ============================
// PERMISSIONS HELPERS
// ============================

// Récupère le membre Discord (sécurisé)
async function getMember(interaction) {
  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

// Vérifie si l'utilisateur peut gérer les revenus
function canManageRevenues(member) {
  return (
    member.roles.cache.has(ROLE_BANK) ||
    member.roles.cache.has(ROLE_BIJOUTERIE) ||
    member.roles.cache.has(ROLE_TRANSPORT)
  );
}

// Vérifie si l'utilisateur est un banquier (création de comptes)
function isBankStaff(member) {
  return member.roles.cache.has(ROLE_BANK);
}

// ============================
// INTERACTIONS (COMMANDES)
// ============================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {

    // ============================
    // /create-account
    // ============================
    if (interaction.commandName === "create-account") {
      const target = interaction.options.getUser("user");
      const type = interaction.options.getString("type");

      const staff = await getMember(interaction);
      if (!staff || !isBankStaff(staff)) {
        return interaction.reply({
          content: "Tu n'as pas la permission de créer des comptes.",
          ephemeral: true
        });
      }

      // Un seul compte par joueur
      if (accounts[target.id]) {
        return interaction.reply({
          content: "Ce joueur possède déjà un compte bancaire.",
          ephemeral: true
        });
      }

      // Création de la carte
      const card = {
        type,
        number: generateCardNumber(),
        cvv: generateCVV(),
        valid: generateValidThru()
      };

      accounts[target.id] = {
        userId: target.id,
        createdAt: Date.now(),
        card
      };

      saveAccounts();

      const embed = baseEmbed()
        .setTitle("💳 Compte bancaire créé")
        .setDescription(`Un compte vient d'être créé pour **${target.tag}**`)
        .addFields(
          { name: "Type", value: type, inline: true },
          { name: "Numéro", value: card.number, inline: false },
          { name: "CVV", value: card.cvv, inline: true },
          { name: "Validité", value: card.valid, inline: true }
        )
        .setThumbnail(CARD_IMAGES[type]);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ============================
    // /account
    // ============================
    if (interaction.commandName === "account") {
      const target = interaction.options.getUser("user") || interaction.user;

      const data = accounts[target.id];
      if (!data) {
        return interaction.reply({
          content: "Ce joueur n'a pas de compte bancaire.",
          ephemeral: true
        });
      }

      const card = data.card;

      const embed = baseEmbed()
        .setTitle("💳 Carte bancaire")
        .setDescription(`Carte de **${target.tag}**`)
        .addFields(
          { name: "Type", value: card.type, inline: true },
          { name: "Numéro", value: card.number, inline: false },
          { name: "CVV", value: card.cvv, inline: true },
          { name: "Validité", value: card.valid, inline: true }
        )
        .setThumbnail(CARD_IMAGES[card.type]);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ============================
    // /add-revenue
    // ============================
    if (interaction.commandName === "add-revenue") {
      const sector = interaction.options.getString("sector");
      const amount = interaction.options.getInteger("amount");
      const reason = interaction.options.getString("reason") || "Aucune raison spécifiée.";

      const staff = await getMember(interaction);
      if (!staff || !canManageRevenues(staff)) {
        return interaction.reply({
          content: "Tu n'as pas la permission d'ajouter des revenus.",
          ephemeral: true
        });
      }

      revenues.totals[sector] += amount;

      revenues.history.push({
        sector,
        amount,
        reason,
        by: staff.id,
        timestamp: Date.now()
      });

      saveRevenues();

      const embed = baseEmbed()
        .setTitle("📈 Revenu ajouté")
        .addFields(
          { name: "Secteur", value: sector, inline: true },
          { name: "Montant", value: String(amount), inline: true },
          { name: "Total secteur", value: String(revenues.totals[sector]), inline: true },
          { name: "Raison", value: reason, inline: false },
          { name: "Ajouté par", value: `<@${staff.id}>`, inline: false }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ============================
    // /revenue-history
    // ============================
    if (interaction.commandName === "revenue-history") {
      const staff = await getMember(interaction);
      if (!staff || !canManageRevenues(staff)) {
        return interaction.reply({
          content: "Tu n'as pas la permission de voir l'historique.",
          ephemeral: true
        });
      }

      const list = revenues.history.slice().reverse().slice(0, 10);

      if (list.length === 0) {
        return interaction.reply({
          content: "Aucun revenu enregistré.",
          ephemeral: true
        });
      }

      let table = "```Secteur      | Montant | Par        | Date\n";
      table += "-------------+---------+-----------+----------------\n";

      for (const r of list) {
        const date = new Date(r.timestamp).toLocaleString("fr-FR");
        table += `${r.sector.padEnd(12)}| ${String(r.amount).padEnd(7)}| ${r.by.padEnd(10)}| ${date}\n`;
      }

      table += "```";

      const embed = baseEmbed()
        .setTitle("📊 Historique des revenus")
        .setDescription(table);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ============================
    // /bank-stats
    // ============================
    if (interaction.commandName === "bank-stats") {
      const staff = await getMember(interaction);
      if (!staff || !canManageRevenues(staff)) {
        return interaction.reply({
          content: "Tu n'as pas la permission de voir les statistiques.",
          ephemeral: true
        });
      }

      const t = revenues.totals;
      const total = t.BANK + t.BIJOUTERIE + t.TRANSPORT;

      const embed = baseEmbed()
        .setTitle("🏦 Statistiques NTCG")
        .addFields(
          { name: "BANK", value: String(t.BANK), inline: true },
          { name: "BIJOUTERIE", value: String(t.BIJOUTERIE), inline: true },
          { name: "TRANSPORT", value: String(t.TRANSPORT), inline: true },
          { name: "TOTAL GLOBAL", value: String(total), inline: false }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

  } catch (err) {
    console.error("Erreur interaction :", err);
    if (!interaction.replied) {
      interaction.reply({
        content: "Une erreur interne est survenue.",
        ephemeral: true
      });
    }
  }
});

// ============================
// LOGIN DU BOT
// ============================
client.login(TOKEN);

