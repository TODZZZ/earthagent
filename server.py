from flask import Flask, request, jsonify
from flask_cors import CORS
from validators import validate_earth_engine_code
import traceback

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the Chrome extension

@app.route('/validate', methods=['POST'])
def validate():
    """
    Endpoint to validate Earth Engine JavaScript code
    
    Request body should be JSON with a 'code' field containing the code to validate
    """
    try:
        data = request.json
        if not data or 'code' not in data:
            return jsonify({'error': 'No code provided'}), 400
        
        code = data['code']
        # Validate the JavaScript code
        validated_code = validate_earth_engine_code(code)
        
        return jsonify({
            'valid': True,
            'code': validated_code
        })
    except Exception as e:
        # Return the error message
        return jsonify({
            'valid': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 400

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000) 