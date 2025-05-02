async function all(request, reply) {
    return reply.sendFile('layout.html');  // Serve static 'index.html' from the 'public' folder
}

module.exports = { all };
