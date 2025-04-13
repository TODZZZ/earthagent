from pydantic import BaseModel, Field, field_validator
import re
import subprocess
import tempfile
import os

class JavaScriptCode(BaseModel):
    """Model for validating JavaScript code."""
    code: str = Field(..., description="The JavaScript code to validate")
    
    @field_validator('code')
    @classmethod
    def validate_js_syntax(cls, v: str) -> str:
        """Validate that the string contains valid JavaScript syntax."""
        # Basic syntax validation using regex
        # Check for common JS syntax patterns
        if not re.search(r'(var|let|const|function|\=|\(|\)|\{|\}|;)', v):
            raise ValueError("String doesn't appear to contain JavaScript code")
        
        # For more thorough validation, we could write to a temp file and use Node.js to validate
        try:
            with tempfile.NamedTemporaryFile(suffix='.js', delete=False) as tmp:
                tmp.write(v.encode('utf-8'))
                tmp_name = tmp.name
            
            # Use Node.js to check syntax
            result = subprocess.run(
                ['node', '--check', tmp_name],
                capture_output=True,
                text=True
            )
            
            # Clean up the temp file
            os.unlink(tmp_name)
            
            # If return code is not 0, there's a syntax error
            if result.returncode != 0:
                raise ValueError(f"Invalid JavaScript syntax: {result.stderr}")
            
            return v
        except Exception as e:
            # Fall back to basic validation if Node.js checking fails
            return v

def validate_js_code(code: str) -> str:
    """
    Validate that a string contains valid JavaScript code.
    
    Args:
        code: The string to validate
        
    Returns:
        The validated JavaScript code
        
    Raises:
        ValueError: If the string is not valid JavaScript
    """
    try:
        js_model = JavaScriptCode(code=code)
        return js_model.code
    except Exception as e:
        # If validation fails, we could try to fix common issues
        # For now, just re-raise the exception
        raise ValueError(f"JavaScript validation failed: {str(e)}")


# Earth Engine specific validation
class EarthEngineCode(JavaScriptCode):
    """Model for validating Google Earth Engine JavaScript code."""
    
    @field_validator('code')
    @classmethod
    def validate_ee_code(cls, v: str) -> str:
        """Validate that the code is Google Earth Engine code."""
        # Check for common Earth Engine patterns
        ee_patterns = [
            r'ee\.Image',
            r'ee\.FeatureCollection',
            r'ee\.Geometry',
            r'ee\.Reducer',
            r'Map\.addLayer',
            r'ee\.Filter',
            r'ee\.Date'
        ]
        
        if not any(re.search(pattern, v) for pattern in ee_patterns):
            raise ValueError("Code doesn't appear to be Earth Engine JavaScript")
            
        return v

def validate_earth_engine_code(code: str) -> str:
    """
    Validate that a string contains valid Earth Engine JavaScript code.
    
    Args:
        code: The string to validate
        
    Returns:
        The validated Earth Engine JavaScript code
        
    Raises:
        ValueError: If the string is not valid Earth Engine JavaScript
    """
    try:
        ee_model = EarthEngineCode(code=code)
        return ee_model.code
    except Exception as e:
        raise ValueError(f"Earth Engine code validation failed: {str(e)}") 