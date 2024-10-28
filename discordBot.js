const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType, REST, Routes } = require('discord.js');
const axios = require('axios');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
require('dotenv').config(); 


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMessageReactions, 
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
  ],
});


let cachedLeaderboard = [];
let lastGenerated = 'N/A'; 

// slash commands!
const commands = [
  {
    name: 'leaderboard',
    description: 'Fetches the top guilds by duels wins.'
  },
  {
    name: 'update',
    description: 'Manually updates the leaderboard data.'
  }
];


const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

// gloal command registeration
async function registerGlobalCommands() {
  try {
    const clientId = process.env.CLIENT_ID;
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );
    console.log('Successfully registered global application commands.');
  } catch (error) {
    console.error('Error registering global commands:', error);
  }
}


async function fetchLeaderboardData() {
  const url = 'https://sk1er.club/leaderboards/guild_wins_duels';

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('table tbody');

  
    const leaderboard = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(row => {
        const rank = row.querySelector('td:nth-child(1)').textContent.trim();
        const guildName = row.querySelector('td:nth-child(3)').textContent.trim();
        const wins = row.querySelector('td:nth-child(4)').textContent.trim();
        return { rank, guildName, wins };
      });
    });

 
    const lastGenerated = await page.evaluate(() => {
      const lastGenText = document.body.innerText.match(/Last Generated:\s*(.*)/);
      return lastGenText ? lastGenText[1].trim() : 'N/A';
    });

    await browser.close();
    return { leaderboard: leaderboard.slice(0, 5), lastGenerated };
  } catch (error) {
    console.error('Error fetching leaderboard data:', error);
    return { leaderboard: [], lastGenerated: 'N/A' };
  }
}
function startChecking() {
  const checkInterval = setInterval(async () => {
    const updated = await checkWebsite();
    if (updated) {
      clearInterval(checkInterval); 
      setTimeout(startChecking, 79200000); // 79200000= 2h
    }
  }, 60000); // 60000= 1min
}

async function checkWebsite() {
  try {
    const response = await axios.get('https://sk1er.club/leaderboards/guild_wins_duels');
    const $ = cheerio.load(response.data);

    const lastGeneratedText = $('body').text().match(/Last Generated: [0-9]+ Minute Ago/);
    if (lastGeneratedText && lastGeneratedText[0] === 'Last Generated: 0 Minute Ago') {
      console.log('Website updated');
      fetchLeaderboardData();
      return true;
    }
  } catch (error) {
    console.error('Error checking website:', error);
  }
  return false;
}


client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'leaderboard') {
    await interaction.deferReply();

    if (cachedLeaderboard.length === 0) {
      return interaction.editReply('No leaderboard data available.');
    }

    const embed = new EmbedBuilder()
      .setTitle('Top Guilds by Duels Wins')
      .setColor('#0099ff');

    cachedLeaderboard.forEach((entry, index) => {
      embed.addFields({ name: `${index + 1}. ${entry.guildName}`, value: `Wins: ${entry.wins}`, inline: false });
    });

    embed.setFooter({ text: `Last Generated: ${lastGenerated}` });
    await interaction.editReply({ embeds: [embed] });
  } else if (commandName === 'update') {
    await interaction.deferReply();

    try {
      const { leaderboard, lastGenerated: newLastGenerated } = await fetchLeaderboardData();

     
      cachedLeaderboard = leaderboard;
      lastGenerated = newLastGenerated;

      if (leaderboard.length > 0) {
        await interaction.editReply('Leaderboard data updated successfully.');
      } else {
        await interaction.editReply('Failed to update leaderboard data.');
      }
    } catch (error) {
      console.error('Error handling update command:', error);
      await interaction.editReply('An error occurred while updating the leaderboard.');
    }
  }
});


client.once('ready', async () => {
  console.log('Bot is online!');
  client.user.setPresence({
    activities: [{
      name: '9/11',
      type: ActivityType.Watching,
    }],
    status: 'dnd'
  });
  registerGlobalCommands();
  startChecking();
});

const token = process.env.BOT_TOKEN;
client.login(token);
