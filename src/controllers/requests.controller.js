export function processRequest(req, res) {
  try {
    const input = req.body;

    res.json({
      success: true,
     
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}