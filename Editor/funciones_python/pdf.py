import os
from PyPDF2 import PdfMerger, PdfReader, PdfWriter
from PyPDF2.errors import PdfReadError
import zipfile
import fitz
import shutil
import traceback

def join_pdfs(pdf_file_paths: list, output_directory: str):
  """Une múltiples archivos PDF en uno solo."""
  if not pdf_file_paths:
      raise ValueError("No se proporcionaron archivos PDF para unir.")

  merger = PdfMerger()
  output_filename = "pdfs_combinados.pdf"
  output_path = os.path.join(output_directory, output_filename)

  try: 
      for pdf_path in pdf_file_paths: # Iterar sobre los archivos PDF
          if not os.path.exists(pdf_path): 
              raise FileNotFoundError(f"Archivo no encontrado: {pdf_path}") 
          try:  
              with open(pdf_path, 'rb') as f:  # Abrir el archivo PDF
                  PdfReader(f) # Leer el archivo PDF
          except PdfReadError:  # Si no es un PDF válido o está corrupto, lanzar error
              raise ValueError(f"El archivo {pdf_path} no es un PDF válido o está corrupto.")
          
          merger.append(pdf_path) # Agregar cada PDF al merger
      
      merger.write(output_path) # Guardar el merger en el archivo de salida
      return output_path # Devolver la ruta del archivo de salida
  except Exception as e: # Si ocurre algún error
      raise Exception(f"Error al unir PDFs: {str(e)}") 
  finally: # Asegurar que se cierra el merger
      merger.close()

def split_pdf_by_range(input_pdf_path: str, output_directory: str, start_page: int, end_page: int):
  """Divide un PDF extrayendo un rango específico de páginas."""
  if not os.path.exists(input_pdf_path):
      raise FileNotFoundError(f"Archivo PDF de entrada no encontrado en {input_pdf_path}")

  os.makedirs(output_directory, exist_ok=True)

  try:
      reader = PdfReader(input_pdf_path)
      num_pages = len(reader.pages)

      if not (1 <= start_page <= num_pages and 1 <= end_page <= num_pages): 
          raise ValueError(
              f"Las páginas de inicio ({start_page}) o fin ({end_page}) "
              f"están fuera del rango válido (1 a {num_pages})."
          )
      if start_page > end_page:
          raise ValueError(f"La página de inicio ({start_page}) no puede ser mayor que la página final ({end_page}).")

      writer = PdfWriter() 
      
      for i in range(start_page - 1, end_page): 
          writer.add_page(reader.pages[i]) 
      
      base_name = os.path.splitext(os.path.basename(input_pdf_path))[0]
      output_pdf_name = f"{base_name}_rango_{start_page}_a_{end_page}.pdf"
      output_pdf_path = os.path.join(output_directory, output_pdf_name)

      with open(output_pdf_path, "wb") as output_file:
          writer.write(output_file)
      
      return output_pdf_path

  except PdfReadError:
      raise Exception(f"Error al leer el archivo PDF '{input_pdf_path}'. Podría estar corrupto o encriptado.")
  except Exception as e:
      raise Exception(f"Error al dividir el PDF por rango: {str(e)}")

def zip_pdfs(input_pdf_path, output_dir, pages_per_file, original_filename_base):
  """Divide un PDF en múltiples archivos y los comprime en un ZIP."""
  if pages_per_file <= 0:
      raise ValueError("El número de páginas por archivo debe ser mayor que 0.")
  
  os.makedirs(output_dir, exist_ok=True)

  try:
      reader = PdfReader(input_pdf_path)
      total_pages = len(reader.pages)
      
      if total_pages == 0:
          raise ValueError("El PDF no contiene páginas.")
      
      zip_filename = os.path.join(output_dir, f"{original_filename_base}_split.zip")
      
      with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zf:
          for i in range(0, total_pages, pages_per_file):
              writer = PdfWriter() 
              start_page = i
              end_page = min(i + pages_per_file, total_pages)  
              
              for page_num in range(start_page, end_page): 
                  writer.add_page(reader.pages[page_num]) 
              
              split_pdf_name = f"{original_filename_base}_parte_{start_page + 1}-{end_page}.pdf" 
              
              temp_split_pdf_path = os.path.join(output_dir, split_pdf_name) 
              with open(temp_split_pdf_path, "wb") as output_pdf: 
                  writer.write(output_pdf) 
              
              zf.write(temp_split_pdf_path, arcname=split_pdf_name) 
              
              # Limpiar archivo temporal
              os.remove(temp_split_pdf_path)
              
      return zip_filename
  
  except Exception as e:
      raise Exception(f"Error al crear ZIP de PDFs divididos: {str(e)}")

def clean_filename(filename):
  """Limpia el nombre de archivo removiendo caracteres especiales."""
  name, _ = os.path.splitext(filename)
  clean_name = "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).strip()
  return clean_name if clean_name else "archivo_sin_nombre"

def comprimir_pdf(input_pdf_path: str, output_pdf_path: str) -> bool:
  """Comprime un PDF reduciendo la calidad de las imágenes."""
  if not os.path.exists(input_pdf_path):
      raise FileNotFoundError(f"Archivo no encontrado: {input_pdf_path}")

  try:
      doc = fitz.open(input_pdf_path) 
      
      # Verificar que el documento se abrió correctamente
      if doc.page_count == 0:
          raise ValueError("El PDF no contiene páginas.")
      
      # Reescribir imágenes con menor calidad
      doc.rewrite_images(
          dpi_threshold=120, 
          dpi_target=60,    
          quality=75         
      )
      
      # Guardar con compresión
      doc.save( 
          output_pdf_path,
          garbage=3,          # Limpieza de objetos no utilizados
          deflate=True,       # Compresión deflate
          use_objstms=True    # Usar object streams
      ) 
      doc.close()
      return True

  except Exception as e:
      raise Exception(f"Error al comprimir el PDF: {e}")

def rotar_pdf(input_pdf_path: str, output_pdf_path: str, page_rotations: dict) -> bool:

  if not os.path.exists(input_pdf_path):
      raise FileNotFoundError(f"Archivo no encontrado: {input_pdf_path}")
  
  if not page_rotations:
      print("Advertencia: No se proporcionaron rotaciones de página. El PDF no será modificado.")
      shutil.copy(input_pdf_path, output_pdf_path)
      return True
  
  doc = None
  try:
      doc = fitz.open(input_pdf_path)
      print(f"PDF abierto correctamente. Total de páginas: {doc.page_count}")
      
      if doc.page_count == 0:
          raise ValueError("El PDF no contiene páginas. No se pueden aplicar rotaciones.")
      
      rotations_applied = 0
      for page_index_str, angle_value in page_rotations.items():
          try: 
              page_index = int(page_index_str)  
              angle = int(angle_value)
              
              # Validar ángulo de rotación
              if angle not in [0, 90, 180, 270]:
                  print(f"Advertencia: Ángulo {angle} no es válido para página {page_index}. Debe ser 0, 90, 180 o 270. Ignorando.")
                  continue
              
              if 0 <= page_index < doc.page_count: 
                  pagina = doc[page_index] 
                  pagina.set_rotation(angle) 
                  print(f"✓ Página {page_index + 1} rotada a {angle}°.")
                  rotations_applied += 1
              else:
                  print(f"Advertencia: Índice de página {page_index} fuera de rango (0 a {doc.page_count - 1}). Ignorando rotación.")
          except (ValueError, TypeError) as e:
              print(f"Advertencia: Error al procesar rotación para página {page_index_str}: {e}. Ignorando.")
              continue

      if rotations_applied > 0: 
          print(f"DEBUG: Rotaciones aplicadas > 0. Intentando guardar PDF.")
          if doc.is_closed:
              raise Exception("El documento PDF ya está cerrado antes de intentar guardar. Esto indica un problema previo.")
          
          doc.save(output_pdf_path,   
                  garbage=4,           
                  deflate=True,      
                  clean=True,         
                  pretty=False)       
          print(f"DEBUG: doc.save() completado.")

          if os.path.exists(output_pdf_path):
              file_size = os.path.getsize(output_pdf_path)
              print(f"✓ PDF guardado correctamente. Tamaño: {file_size} bytes")
              return True
          else:
              print("❌ Error: El archivo de salida no se creó después de guardar.")
              raise Exception("El PDF rotado no se pudo generar.")
      else:
          print("❌ No se aplicaron rotaciones válidas, no se generará un nuevo archivo PDF.")
          shutil.copy(input_pdf_path, output_pdf_path)
          print("PDF original copiado al destino de salida.")
          return True 
  except Exception as e:
      print(f"❌ ERROR CRÍTICO en rotar_pdf (catch principal): {e}")
      traceback.print_exc() 
      raise Exception(f"Error crítico al rotar el PDF: {e}")
  finally:
      if doc and not doc.is_closed:
          print("DEBUG: Cerrando documento PDF en finally.")
          doc.close()
      elif doc and doc.is_closed:
          print("DEBUG: Documento PDF ya estaba cerrado en finally.")
      else:
          print("DEBUG: Documento PDF no inicializado o ya nulo en finally.")

def extract_specific_pages(input_pdf_path: str, output_directory: str, pages_specification: str, original_filename_base: str):
    """
    Extrae páginas específicas de un PDF y crea UN SOLO PDF con esas páginas.
    
    Args:
        input_pdf_path: Ruta del PDF de entrada
        output_directory: Directorio donde guardar el archivo resultante
        pages_specification: Especificación de páginas como "1, 3-5, 9"
        original_filename_base: Nombre base para el archivo de salida
    
    Returns:
        str: Ruta del PDF generado con las páginas extraídas
    """
    if not os.path.exists(input_pdf_path):
        raise FileNotFoundError(f"Archivo PDF de entrada no encontrado en {input_pdf_path}")

    os.makedirs(output_directory, exist_ok=True)

    try:
        reader = PdfReader(input_pdf_path)
        total_pages = len(reader.pages)
        
        if total_pages == 0:
            raise ValueError("El PDF no contiene páginas.")

        page_numbers = parse_page_specification(pages_specification, total_pages) 
        
        if not page_numbers:
            raise ValueError("No se especificaron páginas válidas.")

        writer = PdfWriter() 
        
        # Agregar páginas en el orden especificado
        for page_num in page_numbers:
            writer.add_page(reader.pages[page_num - 1])  # -1 porque las páginas son 0-indexed
        
        # Crear nombre del archivo de salida
        pages_str = pages_specification.replace(" ", "").replace(",", "_")
        output_pdf_name = f"{original_filename_base}_paginas_{pages_str}.pdf"
        output_pdf_path = os.path.join(output_directory, output_pdf_name)
        
        # Guardar el PDF
        with open(output_pdf_path, "wb") as output_file:
            writer.write(output_file)
        
        return output_pdf_path

    except Exception as e:
        raise Exception(f"Error al extraer páginas específicas: {str(e)}")

def parse_page_specification(pages_spec: str, total_pages: int) -> list:
    """
    Parsea una especificación de páginas como "1, 3-5, 9" y devuelve una lista de números de página.
    MANTIENE EL ORDEN especificado por el usuario.
    
    Args:
        pages_spec: Especificación como "1, 3-5, 9"
        total_pages: Total de páginas en el PDF
    
    Returns:
        list: Lista de números de página en el orden especificado
    """
    page_numbers = []
    
    # Limpiar y dividir por comas
    parts = [part.strip() for part in pages_spec.split(',') if part.strip()]
    
    for part in parts:
        if '-' in part:
            # Es un rango como "3-5"
            try:
                start, end = part.split('-', 1)
                start_page = int(start.strip())
                end_page = int(end.strip())
                
                if start_page > end_page:
                    raise ValueError(f"Rango inválido: {part}. El inicio no puede ser mayor que el final.")
                
                # Agregar todas las páginas del rango EN ORDEN
                for page in range(start_page, end_page + 1):
                    if 1 <= page <= total_pages:
                        page_numbers.append(page)
                    else:
                        raise ValueError(f"Página {page} fuera de rango (1-{total_pages}).")
                        
            except ValueError as e:
                if "invalid literal for int()" in str(e):
                    raise ValueError(f"Formato de rango inválido: {part}. Use formato como '3-5'.")
                else:
                    raise e
        else:
            # Es una página individual como "1" o "9"
            try:
                page = int(part)
                if 1 <= page <= total_pages:
                    page_numbers.append(page)
                else:
                    raise ValueError(f"Página {page} fuera de rango (1-{total_pages}).")
            except ValueError:
                raise ValueError(f"Número de página inválido: {part}")
    
    # Eliminar duplicados manteniendo el orden
    seen = set()
    unique_pages = []
    for page in page_numbers:
        if page not in seen:
            seen.add(page)
            unique_pages.append(page)
    
    return unique_pages

def remover_contraseña_pdf(input_pdf_path: str, output_pdf_path: str, password: str) -> bool:
    """
    Remueve la contraseña de un PDF protegido y genera una versión sin encriptación.
    
    Args:
        input_pdf_path: Ruta del PDF con contraseña
        output_pdf_path: Ruta donde guardar el PDF sin contraseña
        password: Contraseña del PDF
    
    Returns:
        bool: True si se removió la contraseña exitosamente
        
    Raises:
        FileNotFoundError: Si el archivo de entrada no existe
        ValueError: Si la contraseña es incorrecta o el PDF no está encriptado
        Exception: Para otros errores durante el procesamiento
    """
    if not os.path.exists(input_pdf_path):
        raise FileNotFoundError(f"Archivo PDF no encontrado: {input_pdf_path}")
    
    if not password or not password.strip():
        raise ValueError("La contraseña no puede estar vacía")
    
    try:
        # Intentar abrir el PDF
        reader = PdfReader(input_pdf_path)
        
        # Verificar si el PDF está encriptado
        if not reader.is_encrypted:
            raise ValueError("El PDF no está protegido con contraseña")
        
        # Intentar desencriptar con la contraseña proporcionada
        decrypt_result = reader.decrypt(password)
        
        if decrypt_result == 0:
            raise ValueError("Contraseña incorrecta. No se pudo desencriptar el PDF")
        elif decrypt_result == 1:
            print("✓ PDF desencriptado exitosamente (contraseña de usuario)")
        elif decrypt_result == 2:
            print("✓ PDF desencriptado exitosamente (contraseña de propietario)")
        
        # Verificar que el PDF tiene páginas
        total_pages = len(reader.pages)
        if total_pages == 0:
            raise ValueError("El PDF no contiene páginas válidas")
        
        print(f"PDF desencriptado: {total_pages} páginas encontradas")
        
        # Crear un nuevo PDF sin encriptación
        writer = PdfWriter()
        
        # Copiar todas las páginas al nuevo PDF
        for page_num in range(total_pages):
            try:
                page = reader.pages[page_num]
                writer.add_page(page)
            except Exception as e:
                print(f"Advertencia: Error al procesar página {page_num + 1}: {e}")
                continue
        
        # Verificar que se agregaron páginas
        if len(writer.pages) == 0:
            raise Exception("No se pudieron procesar las páginas del PDF")
        
        # Crear directorio de salida si no existe
        output_dir = os.path.dirname(output_pdf_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        # Guardar el PDF sin contraseña
        with open(output_pdf_path, 'wb') as output_file:
            writer.write(output_file)
        
        # Verificar que el archivo se creó correctamente
        if not os.path.exists(output_pdf_path):
            raise Exception("No se pudo crear el archivo de salida")
        
        file_size = os.path.getsize(output_pdf_path)
        if file_size == 0:
            raise Exception("El archivo de salida está vacío")
        
        print(f"✓ PDF sin contraseña guardado exitosamente")
        print(f"  - Páginas procesadas: {len(writer.pages)}")
        print(f"  - Tamaño del archivo: {file_size} bytes")
        print(f"  - Ubicación: {output_pdf_path}")
        
        return True
        
    except PdfReadError as e:
        if "Invalid PDF" in str(e):
            raise Exception(f"El archivo no es un PDF válido: {e}")
        elif "Bad decrypt" in str(e):
            raise ValueError("Contraseña incorrecta o PDF corrupto")
        else:
            raise Exception(f"Error al leer el PDF: {e}")
    
    except ValueError as e:
        # Re-lanzar errores de validación tal como están
        raise e
    
    except Exception as e:
        print(f"❌ ERROR en remover_contraseña_pdf: {e}")
        traceback.print_exc()
        raise Exception(f"Error inesperado al remover contraseña: {e}")

def verificar_pdf_protegido(input_pdf_path: str) -> dict:
    """
    Verifica si un PDF está protegido con contraseña y devuelve información sobre su estado.
    
    Args:
        input_pdf_path: Ruta del archivo PDF
    
    Returns:
        dict: Información sobre el estado del PDF
        {
            'is_encrypted': bool,
            'total_pages': int,
            'file_size': int,
            'needs_password': bool,
            'error': str or None
        }
    """
    result = {
        'is_encrypted': False,
        'total_pages': 0,
        'file_size': 0,
        'needs_password': False,
        'error': None
    }
    
    try:
        if not os.path.exists(input_pdf_path):
            result['error'] = "Archivo no encontrado"
            return result
        
        # Obtener tamaño del archivo
        result['file_size'] = os.path.getsize(input_pdf_path)
        
        # Intentar leer el PDF
        reader = PdfReader(input_pdf_path)
        
        # Verificar si está encriptado
        result['is_encrypted'] = reader.is_encrypted
        result['needs_password'] = reader.is_encrypted
        
        if not reader.is_encrypted:
            # Si no está encriptado, obtener número de páginas
            result['total_pages'] = len(reader.pages)
        else:
            # Si está encriptado, no podemos obtener las páginas sin contraseña
            result['total_pages'] = 0
        
        return result
        
    except PdfReadError as e:
        result['error'] = f"Error al leer PDF: {str(e)}"
        return result
    except Exception as e:
        result['error'] = f"Error inesperado: {str(e)}"
        return result

