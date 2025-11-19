// File browser page route
app.get('/files/:host', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'files.html'));
});