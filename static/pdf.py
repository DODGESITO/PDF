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
      for pdf_path in pdf_file_paths:
          if not os.path.exists(pdf_path):
              raise FileNotFoundError(f"Archivo no encontrado: {pdf_path}")
          
          # Validar que el archivo sea un PDF válido
          try:
              with open(pdf_path, 'rb') as f:
                  PdfReader(f)
          except PdfReadError:
              raise ValueError(f"El archivo {pdf_path} no es un PDF válido o está corrupto.")
          
          merger.append(pdf_path)
      
      merger.write(output_path)
      return output_path
  except Exception as e:
      raise Exception(f"Error al unir PDFs: {str(e)}")
  finally:
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
          dpi_threshold=150,  
          dpi_target=80,      
          quality=60          
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

def aplicar_dibujos_a_pdf(input_pdf_path: str, output_pdf_path: str, dibujos_data) -> bool:
    """
    Aplica dibujos a un PDF con corrección de rotación
    
    Args:
        input_pdf_path: Ruta del PDF original
        output_pdf_path: Ruta donde guardar el PDF con dibujos
        dibujos_data: Lista de dibujos o dict con dibujos por página
    
    Returns:
        bool: True si se aplicaron correctamente
    """
    if not os.path.exists(input_pdf_path):
        raise FileNotFoundError(f"Archivo PDF no encontrado: {input_pdf_path}")
    
    try:
        # Abrir el PDF
        doc = fitz.open(input_pdf_path)
        
        def transform_coordinates(x, y, rotation, width, height):
            """Transforma coordenadas según la rotación de la página"""
            if rotation == 0:
                return x, y
            elif rotation == 90:
                return y, width - x
            elif rotation == 180:
                return width - x, height - y
            elif rotation == 270:
                return height - y, x
            else:
                return x, y
        
        # Organizar dibujos por página
        dibujos_por_pagina = {}
        
        # Si dibujos_data es una lista, organizarla por página
        if isinstance(dibujos_data, list):
            for dibujo in dibujos_data:
                page_index = dibujo.get('pagina', 0)
                if page_index not in dibujos_por_pagina:
                    dibujos_por_pagina[page_index] = []
                dibujos_por_pagina[page_index].append(dibujo)
        # Si es un dict, usarlo directamente
        elif isinstance(dibujos_data, dict):
            dibujos_por_pagina = dibujos_data
        else:
            print("❌ Formato de dibujos no válido")
            return False
        
        print(f"DEBUG: Procesando dibujos en {len(dibujos_por_pagina)} páginas")
        
        # Aplicar dibujos a cada página
        for page_index, dibujos in dibujos_por_pagina.items():
            page_idx = int(page_index)
            
            if page_idx >= len(doc):
                print(f"Advertencia: Página {page_idx} fuera de rango, ignorando.")
                continue
            
            page = doc[page_idx]
            
            # Detectar rotación de la página
            rotation = page.rotation
            page_rect = page.rect
            page_width = page_rect.width
            page_height = page_rect.height
            
            print(f"DEBUG: Página {page_idx} - Rotación: {rotation}°, Dimensiones: {page_width}x{page_height}, Dibujos: {len(dibujos)}")
            
            # Aplicar cada dibujo en esta página
            for dibujo in dibujos:
                if dibujo.get('tipo') == 'dibujo':
                    puntos = dibujo.get('puntos', [])
                    color = dibujo.get('color', '#000000')
                    line_width = dibujo.get('line_width', 2)
                    
                    if len(puntos) > 1:
                        # Convertir color hex a RGB normalizado
                        color_rgb = tuple(int(color[i:i+2], 16) for i in (1, 3, 5))
                        color_normalized = [c/255.0 for c in color_rgb]
                        
                        # Transformar todos los puntos según la rotación
                        puntos_transformados = []
                        for punto in puntos:
                            x_orig, y_orig = punto[0], punto[1]
                            x_trans, y_trans = transform_coordinates(x_orig, y_orig, rotation, page_width, page_height)
                            puntos_transformados.append([x_trans, y_trans])
                        
                        if len(puntos_transformados) == 2:
                            # Para líneas simples de 2 puntos
                            start_point = fitz.Point(puntos_transformados[0][0], puntos_transformados[0][1])
                            end_point = fitz.Point(puntos_transformados[1][0], puntos_transformados[1][1])
                            
                            page.draw_line(
                                start_point, 
                                end_point, 
                                color=color_normalized, 
                                width=line_width
                            )
                        else:
                            # Para líneas con múltiples puntos, crear una curva suave
                            for i in range(len(puntos_transformados) - 1):
                                start_point = fitz.Point(puntos_transformados[i][0], puntos_transformados[i][1])
                                end_point = fitz.Point(puntos_transformados[i+1][0], puntos_transformados[i+1][1])
                                
                                # Dibujar segmento con extremos redondeados
                                page.draw_line(
                                    start_point, 
                                    end_point, 
                                    color=color_normalized, 
                                    width=line_width
                                )
                                
                                # Para líneas gruesas, agregar círculos en las uniones para suavizar
                                if line_width > 3:
                                    circle_radius = line_width / 2
                                    page.draw_circle(
                                        start_point, 
                                        circle_radius, 
                                        color=color_normalized, 
                                        fill=color_normalized
                                    )
        
        # Guardar PDF modificado
        doc.save(output_pdf_path)
        doc.close()
        
        print(f"✓ PDF con dibujos guardado en: {output_pdf_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error al aplicar dibujos al PDF: {e}")
        traceback.print_exc()
        raise Exception(f"Error al aplicar dibujos al PDF: {e}")
    