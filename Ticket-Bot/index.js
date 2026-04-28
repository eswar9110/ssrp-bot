


const TOKEN = process.env.TOKEN || "YOUR_BOT_TOKEN_HERE";
const PANEL_CHANNEL_ID = "1478293006485426279";
const OPEN_CATEGORY_ID = "1478293077809561681";
const CLOSED_CATEGORY_ID = "1478293138589356216";
const STAFF_ROLE_1 = "1478293245984247829";
const STAFF_ROLE_2 = "1478293280843239464";
const STAFF_ROLE_3 = "1478293310002040914";
const LOG_CHANNEL_ID = "LOG_CHANNEL_ID";
const PUBLIC_CHANNEL_ID = "1477055570212163801";
const SUPPORT_CHANNEL_ID = "1478424855480242177";
const WHITELIST_CHANNEL_ID = "1478424877081038891";

const COLOR = 0x4FC3F7;
const FOOTER = 'Moonlight Ticket System';
const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';


const {
    Client, GatewayIntentBits, Partials,
    EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    ChannelType, PermissionsBitField,
    SlashCommandBuilder, REST, Routes,
} = require('discord.js');

const fs = require('fs');
const path = require('path');


const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch { const d = { tickets: [] }; writeDB(d); return d; }
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
function hasOpenTicket(userId) {
    return readDB().tickets.some(t => t.userId === userId && t.status === 'open');
}
function addTicket(userId, channelId, type) {
    const db = readDB();
    db.tickets.push({ userId, channelId, type, status: 'open', createdAt: new Date().toISOString() });
    writeDB(db);
}
function closeTicketInDB(channelId) {
    const db = readDB();
    const t = db.tickets.find(t => t.channelId === channelId);
    if (t) { t.status = 'closed'; t.closedAt = new Date().toISOString(); writeDB(db); }
    return t ?? null;
}
function getTicketByChannel(channelId) {
    return readDB().tickets.find(t => t.channelId === channelId) ?? null;
}


// Holds modal data between modal-submit → confirm-button
const pending = new Map();
function storePending(userId, type, data) {
    const id = `${userId}_${Date.now()}`;
    pending.set(id, { type, userId, data });
    setTimeout(() => pending.delete(id), 10 * 60 * 1000);
    return id;
}


function getStaffRoles() {
    return [STAFF_ROLE_1, STAFF_ROLE_2, STAFF_ROLE_3]
        .filter(r => r && !['ROLE_ID_1', 'ROLE_ID_2', 'ROLE_ID_3'].includes(r));
}
function isStaff(member) {
    const roles = getStaffRoles();
    if (!roles.length) return true;
    return roles.some(r => member.roles.cache.has(r));
}
function sendLog(client, msg) {
    if (!LOG_CHANNEL_ID || LOG_CHANNEL_ID === 'LOG_CHANNEL_ID') return;
    client.channels.cache.get(LOG_CHANNEL_ID)?.send(msg).catch(() => { });
}
function safeName(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
}
function isValidUrl(str) {
    return /^https?:\/\/.+/.test(str.trim());
}


async function buildPerms(guild, userId) {
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: userId,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks,
            ],
        },
        {
            id: client.user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.EmbedLinks,
            ],
        },
    ];
    for (const rId of getStaffRoles()) {
        overwrites.push({
            id: rId,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks,
            ],
        });
    }
    return overwrites;
}

async function createTicketChannel(guild, userId, prefix) {
    const uname = safeName(guild.members.cache.get(userId)?.user.username || 'user');
    const opts = {
        name: `${prefix}-${uname}`,
        type: ChannelType.GuildText,
        permissionOverwrites: await buildPerms(guild, userId),
    };
    if (OPEN_CATEGORY_ID && OPEN_CATEGORY_ID !== 'OPEN_CATEGORY_ID_HERE') opts.parent = OPEN_CATEGORY_ID;
    return guild.channels.create(opts);
}

function closeBtn(channelId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_${channelId}`).setLabel('Close Ticket').setStyle(ButtonStyle.Secondary),
    );
}
function disabledCloseBtn(channelId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_${channelId}`).setLabel('Ticket Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
}


function buildReportEmbed(user, d) {
    return new EmbedBuilder()
        .setColor(0xFF5555)
        .setTitle('PLAYER REPORT')
        .setDescription(DIV)
        .addFields(
            { name: 'Reporter', value: `<@${user.id}>`, inline: true },
            { name: 'Server ID', value: d.serverId, inline: true },
            { name: 'Rule Broken', value: d.rule, inline: false },
            { name: 'POV Link', value: d.pov ?? 'None', inline: false },
        )
        .setFooter({ text: FOOTER }).setTimestamp();
}

function buildSupportEmbed(user, d) {
    return new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('GENERAL SUPPORT')
        .setDescription(DIV)
        .addFields(
            { name: 'User', value: `<@${user.id}>`, inline: true },
            { name: 'Subject', value: d.subject, inline: true },
        )
        .setFooter({ text: FOOTER }).setTimestamp();
}

function buildBugEmbed(user, d) {
    return new EmbedBuilder()
        .setColor(0x00BCD4)
        .setTitle('BUG REPORT')
        .setDescription(DIV)
        .addFields(
            { name: 'Reporter', value: `<@${user.id}>`, inline: true },
            { name: 'Bug Type', value: d.bugType, inline: false },
        )
        .setFooter({ text: FOOTER }).setTimestamp();
}

function buildOtherEmbed(user) {
    return new EmbedBuilder()
        .setColor(0x87CEEB)
        .setTitle('OTHER TICKET')
        .setDescription(DIV)
        .addFields(
            { name: 'User', value: `<@${user.id}>`, inline: true },
            { name: 'Message', value: 'Please type your inquiry below.', inline: false },
        )
        .setFooter({ text: FOOTER }).setTimestamp();
}


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
});


client.once('ready', async () => {
    console.log(`\nLogged in as ${client.user.tag}`);
    client.user.setPresence({ status: 'online', activities: [{ name: 'Ticket System | /panel', type: 3 }] });

    const cmd = new SlashCommandBuilder().setName('panel').setDescription('Send the support system ticket panel').toJSON();
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        for (const [guildId] of client.guilds.cache)
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: [cmd] });
        console.log('Slash command /panel registered.\n');
    } catch (e) { console.error('Command register failed:', e.message); }


    if (PANEL_CHANNEL_ID && PANEL_CHANNEL_ID !== 'PANEL_CHANNEL_ID_HERE') {
        try {
            const panelChannel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
            if (panelChannel) {
                // Delete old bot panel messages to avoid duplicates
                const fetched = await panelChannel.messages.fetch({ limit: 20 });
                const oldPanels = fetched.filter(m =>
                    m.author.id === client.user.id &&
                    m.embeds.length > 0 &&
                    m.embeds[0]?.title === 'MoonLight Support System'
                );
                for (const [, msg] of oldPanels) await msg.delete().catch(() => { });

                const embed = new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setAuthor({ name: 'Moonlight Support System', iconURL: client.user.displayAvatarURL() })
                    .setTitle('━━━  Moonlight Support Center  ━━━')
                    .setDescription(
                        '> **Player Report** — Report a rulebreaker\n' +
                        '> **General Support** — Need help in-game?\n' +
                        '> **Bug Report** — Found a bug?\n' +
                        '> **Other** — Anything else\n\n' +
                        '**Click the button below to open a ticket.**'
                    )
                    .setImage('')
                    .setFooter({ text: 'MoonLight Ticket System  •  Response time < 24h' }).setTimestamp();

                await panelChannel.send({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Secondary),
                    )],
                });
                console.log(`Panel posted to #${panelChannel.name}`);
            }
        } catch (e) { console.error('Failed to auto-post panel:', e.message); }
    }
});


client.on('interactionCreate', async (interaction) => {
    try {


        if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
            if (PANEL_CHANNEL_ID && PANEL_CHANNEL_ID !== 'PANEL_CHANNEL_ID_HERE' && interaction.channelId !== PANEL_CHANNEL_ID)
                return interaction.reply({ content: `The support panel can only be used in <#${PANEL_CHANNEL_ID}>.`, ephemeral: true });

            const embed = new EmbedBuilder()
                .setColor(0x2B2D31)
                .setAuthor({ name: 'MoonLight Support System', iconURL: client.user.displayAvatarURL() })
                .setTitle('━━━  MoonLight Support Center  ━━━')
                .setDescription(
                    '> **Player Report** — Report a rulebreaker\n' +
                    '> **General Support** — Need help in-game?\n' +
                    '> **Bug Report** — Found a bug?\n' +
                    '> **Other** — Anything else\n\n' +
                    '**Click the button below to open a ticket.**'
                )
                .setImage('https://cdn.discordapp.com/attachments/1454823058802999389/1454906310632931524/video4-ezgif.com-video-to-gif-converter.gif?ex=69a7d357&is=69a681d7&hm=b0a152f53eff82325e562975024a4c383349dc8476bccf368aff9f811cb35b74&')
                .setFooter({ text: 'MoonLight Ticket System  •  Response time < 24h' }).setTimestamp();

            return interaction.reply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Secondary),
                )],
            });
        }


        if (interaction.isButton() && interaction.customId === 'create_ticket') {
            if (hasOpenTicket(interaction.user.id))
                return interaction.reply({ content: 'You already have an open ticket. Please close it before opening a new one.', ephemeral: true });

            const menu = new StringSelectMenuBuilder()
                .setCustomId('ticket_type')
                .setPlaceholder('Select ticket category...')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Player Report').setDescription('Report a player for breaking server rules').setValue('report'),
                    new StringSelectMenuOptionBuilder().setLabel('General Support').setDescription('In-game help, account issues, general questions').setValue('support'),
                    new StringSelectMenuOptionBuilder().setLabel('Bug Report').setDescription('Report a script, vehicle, map or UI bug').setValue('bug'),
                    new StringSelectMenuOptionBuilder().setLabel('Other').setDescription('Any other inquiry or request').setValue('other'),
                );

            return interaction.reply({
                content: 'Select the type of ticket you want to open:',
                components: [new ActionRowBuilder().addComponents(menu)],
                ephemeral: true,
            });
        }


        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
            const type = interaction.values[0];
            const { user } = interaction;

            if (hasOpenTicket(user.id))
                return interaction.reply({ content: 'You already have an open ticket. Please resolve it first.', ephemeral: true });


            if (type === 'report') {
                const modal = new ModalBuilder().setCustomId('modal_report').setTitle('Player Report');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('serverId').setLabel('Reported Player Server ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 247').setMaxLength(20),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('rule').setLabel('Rule Broken').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. RDM, VDM, Fail RP...').setMaxLength(100),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('pov').setLabel('POV Link (optional, must start with https://)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://medal.tv/... or https://streamable.com/...').setMaxLength(500),
                    ),
                );
                return interaction.showModal(modal);
            }


            if (type === 'support') {
                const modal = new ModalBuilder().setCustomId('modal_support').setTitle('General Support');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('subject').setLabel('Subject').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Brief summary of your issue...').setMaxLength(100),
                    ),
                );
                return interaction.showModal(modal);
            }


            if (type === 'bug') {
                const modal = new ModalBuilder().setCustomId('modal_bug').setTitle('Bug Report');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('bugType').setLabel('What kind of bug is it?').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('e.g. Vehicle under map, script error, UI glitch...').setMaxLength(500),
                    ),
                );
                return interaction.showModal(modal);
            }


            if (type === 'other') {
                const pid = storePending(user.id, 'other', {});
                const embed = new EmbedBuilder()
                    .setColor(0x87CEEB)
                    .setTitle('Open a General Inquiry Ticket')
                    .setDescription(`${DIV}\nAre you sure you want to open a general inquiry ticket?\nA staff member will assist you as soon as possible.\n${DIV}`)
                    .setFooter({ text: FOOTER }).setTimestamp();

                return interaction.reply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`confirm_${pid}`).setLabel('Yes, Create Ticket').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`cancel_${pid}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                    )],
                    ephemeral: true,
                });
            }
        }


        if (interaction.isModalSubmit() && interaction.customId === 'modal_report') {
            const { user } = interaction;
            const serverId = interaction.fields.getTextInputValue('serverId');
            const rule = interaction.fields.getTextInputValue('rule');
            const pov = interaction.fields.getTextInputValue('pov') || null;

            if (pov && !isValidUrl(pov))
                return interaction.reply({ content: 'Your POV link must be a valid URL starting with https://. Please try again.', ephemeral: true });

            const pid = storePending(user.id, 'report', { serverId, rule, pov });
            const embed = new EmbedBuilder()
                .setColor(0xFF5555)
                .setTitle('Confirm Player Report')
                .setDescription(`${DIV}\nPlease review your report below. Once confirmed, a private ticket channel will be created.\n${DIV}`)
                .addFields(
                    { name: 'Server ID', value: serverId, inline: true },
                    { name: 'Rule Broken', value: rule, inline: false },
                    { name: 'POV Link', value: pov ?? 'None', inline: false },
                )
                .setFooter({ text: FOOTER }).setTimestamp();

            return interaction.reply({
                content: 'After your ticket is created, you can upload additional evidence (images or video) directly in the ticket channel.',
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_${pid}`).setLabel('Confirm Report').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cancel_${pid}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                )],
                ephemeral: true,
            });
        }


        if (interaction.isModalSubmit() && interaction.customId === 'modal_support') {
            const { user } = interaction;
            const subject = interaction.fields.getTextInputValue('subject');

            const pid = storePending(user.id, 'support', { subject });
            const embed = new EmbedBuilder()
                .setColor(COLOR)
                .setTitle('Confirm Support Ticket')
                .setDescription(`${DIV}\nPlease review your ticket details below.\n${DIV}`)
                .addFields(
                    { name: 'Subject', value: subject, inline: true },
                )
                .setFooter({ text: FOOTER }).setTimestamp();

            return interaction.reply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_${pid}`).setLabel('Confirm Ticket').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cancel_${pid}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                )],
                ephemeral: true,
            });
        }


        if (interaction.isModalSubmit() && interaction.customId === 'modal_bug') {
            const { user } = interaction;
            const bugType = interaction.fields.getTextInputValue('bugType');

            const pid = storePending(user.id, 'bug', { bugType });
            const embed = new EmbedBuilder()
                .setColor(0x00BCD4)
                .setTitle('Confirm Bug Report')
                .setDescription(`${DIV}\nPlease review your bug report below.\n${DIV}`)
                .addFields(
                    { name: 'Bug Type', value: bugType, inline: false },
                )
                .setFooter({ text: FOOTER }).setTimestamp();

            return interaction.reply({
                content: 'After your ticket is created, you can upload screenshots or video directly in the ticket channel.',
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_${pid}`).setLabel('Submit Bug Report').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cancel_${pid}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                )],
                ephemeral: true,
            });
        }


        if (interaction.isButton() && (interaction.customId.startsWith('confirm_') || interaction.customId.startsWith('cancel_'))) {
            const isConfirm = interaction.customId.startsWith('confirm_');
            const pid = interaction.customId.replace(/^confirm_|^cancel_/, '');
            const entry = pending.get(pid);

            if (!entry)
                return interaction.update({ content: 'This confirmation has expired. Please create a new ticket.', embeds: [], components: [] });
            if (entry.userId !== interaction.user.id)
                return interaction.reply({ content: 'This is not your confirmation.', ephemeral: true });

            if (!isConfirm) {
                pending.delete(pid);
                return interaction.update({ content: 'Ticket creation cancelled.', embeds: [], components: [] });
            }

            await interaction.deferUpdate();
            const { guild, user } = interaction;
            const { type, data } = entry;
            pending.delete(pid);

            const prefixes = { report: 'report', support: 'support', bug: 'bug', other: 'other' };
            const channel = await createTicketChannel(guild, user.id, prefixes[type]);
            addTicket(user.id, channel.id, type);

            const typeLabel = { report: 'New Player Report', support: 'New Support Ticket', bug: 'New Bug Report', other: 'New Inquiry Ticket' };
            const content = `<@${user.id}> ${typeLabel[type]}`;

            let embed;
            if (type === 'report') embed = buildReportEmbed(user, data);
            else if (type === 'support') embed = buildSupportEmbed(user, data);
            else if (type === 'bug') embed = buildBugEmbed(user, data);
            else embed = buildOtherEmbed(user);

            await channel.send({ content, embeds: [embed], components: [closeBtn(channel.id)] });

            if (type === 'report' || type === 'bug')
                await channel.send({ content: 'You may now upload additional evidence (images or MP4 video) directly in this channel.' });

            sendLog(client, `Ticket created by <@${user.id}> in <#${channel.id}> | Type: ${type}`);
            await interaction.editReply({ content: `Your ticket has been created: <#${channel.id}>`, embeds: [], components: [] });
        }


        if (interaction.isButton() && interaction.customId.startsWith('close_')) {
            const channelId = interaction.customId.replace('close_', '');
            const { guild, member } = interaction;

            if (!isStaff(member))
                return interaction.reply({ content: 'Only staff members can close tickets.', ephemeral: true });

            await interaction.deferReply();
            const channel = interaction.channel;
            const ticket = getTicketByChannel(channelId);
            closeTicketInDB(channelId);

            try {
                let uname = 'user';
                if (ticket?.userId) {
                    const m = guild.members.cache.get(ticket.userId) ?? await guild.members.fetch(ticket.userId).catch(() => null);
                    if (m) uname = safeName(m.user.username);
                }
                const opts = { name: `closed-${uname}` };
                if (CLOSED_CATEGORY_ID && CLOSED_CATEGORY_ID !== 'CLOSED_CATEGORY_ID_HERE') {
                    opts.parent = CLOSED_CATEGORY_ID;
                    opts.lockPermissions = false;
                }
                await channel.edit(opts);
            } catch (e) { console.error('Rename/move failed:', e.message); }

            try {
                const msgs = await channel.messages.fetch({ limit: 20 });
                const botMsg = msgs.find(m => m.author.id === client.user.id && m.components.length > 0 && !m.components[0].components[0].data.disabled);
                if (botMsg) await botMsg.edit({ components: [disabledCloseBtn(channelId)] });
            } catch { /* non-critical */ }

            if (ticket?.userId) {
                try { await channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false }); } catch { /* non-critical */ }
            }

            const closedEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('Ticket Closed')
                .setDescription(`${DIV}\nThis ticket has been closed and moved to the archive.`)
                .addFields(
                    { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Status', value: 'Closed', inline: true },
                )
                .setFooter({ text: FOOTER }).setTimestamp();

            await interaction.editReply({ embeds: [closedEmbed] });
            sendLog(client, `Ticket closed by <@${interaction.user.id}> in <#${channel.id}>`);
        }

    } catch (err) {
        console.error('Error:', err);
        const reply = { content: 'Something went wrong. Please try again.', ephemeral: true };
        if (interaction.replied || interaction.deferred) interaction.followUp(reply).catch(() => { });
        else interaction.reply(reply).catch(() => { });
    }
});


client.login(TOKEN).catch(err => { console.error('Login failed:', err.message); process.exit(1); });


client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();
    const channelId = message.channelId;


    const bannedWords = [
        'lanjakoduka', 'erripuka', 'pukka', 'ni amma', 'niamma',
        'madarchod', 'behenchod', 'randi', 'chutiya', 'bsdk',
        'lanja', 'dengey', 'puku', 'lund', 'gaand', 'bhosdi',
    ];
    const hasBannedWord = bannedWords.some(w => content.includes(w));
    if (hasBannedWord) {
        await message.delete().catch(() => { });
        try {
            await message.member.timeout(5 * 60 * 1000, 'Abusive language');
            await message.channel.send({
                content: `<@${message.author.id}> has been timed out for **5 minutes** for using abusive language.`,
                allowedMentions: { users: [message.author.id] },
            });
        } catch {
            await message.channel.send({
                content: `<@${message.author.id}> Watch your language!`,
                allowedMentions: { users: [message.author.id] },
            });
        }
        return;
    }

    const greetings = ['hi', 'hello', 'hey', 'heyy', 'heyyy', 'hii', 'hiii', 'yo', 'sup', 'whats up', "what's up", 'namaste', 'hola', 'salut'];
    const whitelistKeywords = ['whitelist'];

    const isGreeting = greetings.some(g => content === g || content.startsWith(g + ' ') || content.startsWith(g + '!') || content.startsWith(g + ','));
    const isWhitelistQ = whitelistKeywords.some(k => content.includes(k));


    if (channelId === PUBLIC_CHANNEL_ID) {
        if (isGreeting)
            return message.reply({ content: `Hey **${message.author.username}**, welcome to MoonLight! If you need help, open a ticket.`, allowedMentions: { repliedUser: true } }).catch(() => { });
        if (isWhitelistQ)
            return message.reply({ content: `Apply for whitelist here: <#${WHITELIST_CHANNEL_ID}>`, allowedMentions: { repliedUser: true } }).catch(() => { });
    }


    if (channelId === SUPPORT_CHANNEL_ID) {
        if (isWhitelistQ)
            return message.reply({ content: `Apply for whitelist here: <#${WHITELIST_CHANNEL_ID}>`, allowedMentions: { repliedUser: true } }).catch(() => { });

        const staffRoles = [STAFF_ROLE_1, STAFF_ROLE_2, STAFF_ROLE_3].filter(r => r && !['ROLE_ID_1', 'ROLE_ID_2', 'ROLE_ID_3'].includes(r));
        const mentionedMembers = message.mentions.members;
        if (staffRoles.length && mentionedMembers?.size > 0) {
            const taggedStaff = mentionedMembers.some(m => staffRoles.some(r => m.roles.cache.has(r)));
            if (taggedStaff)
                return message.reply({ content: `Please do not mention anyone directly. Instead, use the appropriate role ping or open a ticket.`, allowedMentions: { repliedUser: true } }).catch(() => { });
        }
    }
});

