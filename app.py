import ee
import geemap.foliumap as geemap
import streamlit as st
import traceback
import os
import pickle
# Configure page
st.set_page_config(layout="wide")

st.title("Earth Engine Map")

# Main two-column layout
col1, col2 = st.columns([3, 1])

with col1:
    # Create main content area for the map
    map_container = st.container()
    with map_container:
        try:
            # Initialize Earth Engine silently
            try:
                ee.Initialize(project='earthageng')
            except:
                ee.Authenticate()
                ee.Initialize(project='earthageng')
            
            # Create map with minimal options
            Map = geemap.Map(center=[27.9881, 86.9250]) # 
            # wirte the map object in to pickle file
            with open('map.pkl', 'wb') as f:
                pickle.dump(Map, f)
            

            map2 = pickle.load(open('map.pkl', 'rb'))
            # Force display of the map with clear height/width
            map2.to_streamlit()
        except Exception as e:
            st.error("Error displaying map. See debug info for details.")

with col2:
    # Debugging section hidden in expandable section
    with st.expander("Debug Information", expanded=False):
        # Check if credentials file exists
        credentials_path = os.path.expanduser("~/.config/earthengine/credentials")
        if os.path.exists(credentials_path):
            st.success(f"✅ Credentials file found")
        else:
            st.error(f"❌ No credentials file found")

        try:
            # Test API connection
            info = ee.Image('NASA/NASADEM_HGT/001').getInfo()
            st.success(f"✅ API connection successful")
        except Exception as e:
            st.error(f"❌ API connection failed: {str(e)}")
            st.code(traceback.format_exc())
            
            # Authentication button if needed
            authenticate = st.button("Authenticate")
            if authenticate:
                try:
                    ee.Authenticate()
                    st.success("Authentication initiated!")
                    st.experimental_rerun()
                except Exception as auth_e:
                    st.error(f"Authentication error: {str(auth_e)}")
                    



