from django.shortcuts import render
from django.http import HttpResponse, JsonResponse, FileResponse
from django.conf import settings
from django.core.files.storage import FileSystemStorage
import os
import threading
import time
import json
from .funciones_python import pdf as pdf_processor

def home(request):
    return render(request, 'home.html')

def join_pdfs_view(request):
    if request.method == 'POST':
        uploaded_files = request.FILES.getlist('pdf_files') 

        if not uploaded_files:
            return JsonResponse({"status": "error", "message": "No se seleccionaron archivos PDF."}, status=400)

        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        temp_pdf_paths = []

        try:
            for uploaded_file in uploaded_files:
                filename = fs.save(uploaded_file.name, uploaded_file)
                temp_pdf_paths.append(fs.path(filename)) 

            output_pdf_path = pdf_processor.join_pdfs(temp_pdf_paths, settings.MEDIA_ROOT)

            with open(output_pdf_path, 'rb') as pdf_file:
                response = HttpResponse(pdf_file.read(), content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{os.path.basename(output_pdf_path)}"'
                return response

        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
        finally:
            for path in temp_pdf_paths:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass
            
            if 'output_pdf_path' in locals() and os.path.exists(output_pdf_path):
                try:
                    os.remove(output_pdf_path)
                except OSError:
                    pass

    return render(request, 'join.html')

def split_pdf(request):
    if request.method == 'POST':
        uploaded_file = request.FILES.get('pdf_file')
        split_method = request.POST.get('split_method')

        if not uploaded_file:
            return JsonResponse({"status": "error", "message": "No se seleccionó ningún archivo PDF."}, status=400)

        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        output_directory = os.path.join(settings.MEDIA_ROOT, 'pdf_temp_processed')
        os.makedirs(output_directory, exist_ok=True)

        files_to_delete_after_response = []

        try:
            original_file_name_base_clean = pdf_processor.clean_filename(uploaded_file.name)
            temp_input_pdf_filename_with_hash = fs.save(uploaded_file.name, uploaded_file)
            temp_input_pdf_path = fs.path(temp_input_pdf_filename_with_hash)
            files_to_delete_after_response.append(temp_input_pdf_path)

            output_file_path_for_response = None
            filename_for_download = None
            content_type_for_download = None

            if split_method == 'pages_per_file':
                pages_per_file_str = request.POST.get('pages_per_file')

                if not pages_per_file_str:
                    return JsonResponse({"status": "error", "message": "El número de páginas por archivo es requerido para este método."}, status=400)

                try:
                    pages_per_file = int(pages_per_file_str)
                    if pages_per_file <= 0:
                        return JsonResponse({"status": "error", "message": "El número de páginas por archivo debe ser un entero positivo."}, status=400)
                except ValueError:
                    return JsonResponse({"status": "error", "message": "Valor inválido para 'páginas por archivo'. Por favor, introduce un número válido."}, status=400)

                output_file_path_for_response = pdf_processor.zip_pdfs(
                    temp_input_pdf_path,
                    output_directory,
                    pages_per_file,
                    original_file_name_base_clean
                )
                filename_for_download = os.path.basename(output_file_path_for_response)
                content_type_for_download = 'application/zip'

            elif split_method == 'page_range':
                start_page_str = request.POST.get('start_page')
                end_page_str = request.POST.get('end_page')

                if not start_page_str or not end_page_str:
                    return JsonResponse({"status": "error", "message": "Página inicial y final son requeridas para la división por rango."}, status=400)

                try:
                    start_page = int(start_page_str)
                    end_page = int(end_page_str)

                    if start_page <= 0 or end_page <= 0:
                        return JsonResponse({"status": "error", "message": "Los números de página deben ser enteros positivos."}, status=400)
                    if start_page > end_page:
                        return JsonResponse({"status": "error", "message": "La página inicial no puede ser mayor que la página final."}, status=400)

                except ValueError:
                    return JsonResponse({"status": "error", "message": "Valor inválido para el rango de páginas. Por favor, introduce números válidos."}, status=400)

                output_file_path_for_response = pdf_processor.split_pdf_by_range(
                    temp_input_pdf_path,
                    output_directory,
                    start_page,
                    end_page
                )
                filename_for_download = f"{original_file_name_base_clean}_rango_{start_page}_a_{end_page}.pdf"
                content_type_for_download = 'application/pdf'

            elif split_method == 'extract_pages':
                pages_specification = request.POST.get('pages_specification')
                split_into_separate_pdfs = request.POST.get('split_into_separate_pdfs') == 'true'

                if not pages_specification:
                    return JsonResponse({"status": "error", "message": "La especificación de páginas es requerida para este método."}, status=400)

                if not pages_specification.strip():
                    return JsonResponse({"status": "error", "message": "La especificación de páginas no puede estar vacía."}, status=400)

                try:
                    if split_into_separate_pdfs:
                        
                        output_file_path_for_response = pdf_processor.extract_specific_pages_to_zip(
                            temp_input_pdf_path,
                            output_directory,
                            pages_specification,
                            original_file_name_base_clean
                        )
                        filename_for_download = os.path.basename(output_file_path_for_response)
                        content_type_for_download = 'application/zip'
                    else:
              
                        output_file_path_for_response = pdf_processor.extract_specific_pages(
                            temp_input_pdf_path,
                            output_directory,
                            pages_specification,
                            original_file_name_base_clean
                        )

                        pages_clean = pages_specification.replace(" ", "").replace(",", "_")
                        filename_for_download = f"{original_file_name_base_clean}_paginas_{pages_clean}.pdf"
                        content_type_for_download = 'application/pdf'

                except ValueError as e:
                    return JsonResponse({"status": "error", "message": f"Error en la especificación de páginas: {str(e)}"}, status=400)
                except Exception as e:
                    return JsonResponse({"status": "error", "message": f"Error al extraer páginas específicas: {str(e)}"}, status=500)

            else:
                return JsonResponse({"status": "error", "message": "Método de división inválido seleccionado."}, status=400)

            if output_file_path_for_response:
                files_to_delete_after_response.append(output_file_path_for_response)

                response = FileResponse(
                    open(output_file_path_for_response, 'rb'),
                    content_type=content_type_for_download,
                    filename=filename_for_download,
                    as_attachment=True
                )

                def cleanup_files():
                    time.sleep(2)  # Wait for response to be sent
                    for f in files_to_delete_after_response:
                        if os.path.exists(f):
                            try:
                                os.remove(f)
                                print(f"Eliminado: {f}")
                            except OSError as e:
                                print(f"Error eliminando {f}: {e}")

                    # Clean up directory if empty
                    if os.path.exists(output_directory) and not os.listdir(output_directory):
                        try:
                            os.rmdir(output_directory)
                            print(f"Directorio eliminado: {output_directory}")
                        except OSError as e:
                            print(f"Error eliminando directorio {output_directory}: {e}")

                # Start cleanup in background thread
                cleanup_thread = threading.Thread(target=cleanup_files)
                cleanup_thread.daemon = True
                cleanup_thread.start()

                return response
            else:
                return JsonResponse({"status": "error", "message": "No se generó un archivo de salida final."}, status=500)

        except ValueError as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
        except Exception as e:
            print(f"ERROR: Fallo inesperado durante el procesamiento en la vista: {e}")
            # Clean up on error
            for f in files_to_delete_after_response:
                if os.path.exists(f):
                    try:
                        os.remove(f)
                    except OSError as ose:
                        print(f"ADVERTENCIA: No se pudo eliminar el archivo temporal {f} durante el manejo de errores: {ose}")
            if os.path.exists(output_directory) and not os.listdir(output_directory):
                try:
                    os.rmdir(output_directory)
                except OSError as ose:
                    print(f"ADVERTENCIA: No se pudo eliminar el directorio temporal {output_directory} durante el manejo de errores: {ose}")
            return JsonResponse({"status": "error", "message": f"Ocurrió un error inesperado durante el procesamiento del PDF: {e}"}, status=500)

    return render(request, 'split.html')

def compress_pdf_view(request):
    if request.method == 'POST':
        uploaded_file = request.FILES.get('pdf_file')
        if not uploaded_file:
            return JsonResponse({"status": "error", "message": "No se seleccionó ningún archivo PDF."}, status=400)

        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        temp_pdf_paths = []
        output_pdf_path = None

        try:
            # Save input file
            input_filename = fs.save(uploaded_file.name, uploaded_file)
            input_pdf_path = fs.path(input_filename)
            temp_pdf_paths.append(input_pdf_path)

            # Prepare output path
            base_name, ext = os.path.splitext(uploaded_file.name)
            output_filename = f"{base_name}_comprimido{ext}"
            output_pdf_path = os.path.join(settings.MEDIA_ROOT, output_filename)

            # Process PDF
            success = pdf_processor.comprimir_pdf(input_pdf_path, output_pdf_path)

            if success and os.path.exists(output_pdf_path):
                response = FileResponse(
                    open(output_pdf_path, 'rb'),
                    content_type='application/pdf',
                    filename=os.path.basename(output_pdf_path),
                    as_attachment=True
                )
                
                def cleanup_files():
                    time.sleep(2)  # Wait for response to be sent
                    # Clean up input files
                    for path in temp_pdf_paths:
                        if os.path.exists(path):
                            try:
                                os.remove(path)
                                print(f"Eliminado input: {path}")
                            except OSError as e:
                                print(f"Error eliminando input {path}: {e}")
                    
                    # Clean up output file
                    if output_pdf_path and os.path.exists(output_pdf_path):
                        try:
                            os.remove(output_pdf_path)
                            print(f"Eliminado output: {output_pdf_path}")
                        except OSError as e:
                            print(f"Error eliminando output {output_pdf_path}: {e}")
                
                # Start cleanup in background thread
                cleanup_thread = threading.Thread(target=cleanup_files)
                cleanup_thread.daemon = True
                cleanup_thread.start()
                
                return response
            else:
                return JsonResponse({"status": "error", "message": "La compresión falló o no se generó el archivo."}, status=500)

        except FileNotFoundError as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": f"Ocurrió un error inesperado: {str(e)}"}, status=500)
        finally:
            if not (output_pdf_path and os.path.exists(output_pdf_path)):
                # Only clean up if we didn't create a successful output
                for path in temp_pdf_paths:
                    try:
                        if os.path.exists(path):
                            os.remove(path)
                    except Exception:
                        pass

    return render(request, 'compress.html')

def rotate_pdf(request):
    if request.method == 'POST':
        uploaded_file = request.FILES.get('pdf_file') 

        if not uploaded_file:
            return JsonResponse({"status": "error", "message": "No se seleccionó ningún archivo PDF."}, status=400)
        
        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        input_pdf_path = None
        output_pdf_path = None
        
        try:
            input_filename = fs.save(uploaded_file.name, uploaded_file)
            input_pdf_path = fs.path(input_filename)
            
            base_name, ext = os.path.splitext(uploaded_file.name)
            output_filename = f"{base_name}_rotado{ext}"
            output_pdf_path = os.path.join(settings.MEDIA_ROOT, output_filename)
            
            page_rotations_json = request.POST.get('page_rotations')
            if not page_rotations_json:
                return JsonResponse({"status": "error", "message": "No se recibieron datos de rotación de página."}, status=400)
            
            try:
                page_rotations_data = json.loads(page_rotations_json)
            except json.JSONDecodeError:
                return JsonResponse({"status": "error", "message": "Formato de datos de rotación de página inválido."}, status=400)
            
            success = pdf_processor.rotar_pdf(input_pdf_path, output_pdf_path, page_rotations_data)
            
            if success:
                with open(output_pdf_path, 'rb') as pdf_file:
                    response = HttpResponse(pdf_file.read(), content_type='application/pdf')
                    response['Content-Disposition'] = f'attachment; filename="{os.path.basename(output_pdf_path)}"'
                    return response
            else:
                return JsonResponse({"status": "error", "message": "La rotación falló por una razón desconocida."}, status=500)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
        finally:
            if input_pdf_path and os.path.exists(input_pdf_path):
                try:
                    os.remove(input_pdf_path)
                except OSError:
                    pass
            if output_pdf_path and os.path.exists(output_pdf_path):
                try:
                    os.remove(output_pdf_path)
                except OSError:
                    pass
    return render(request, 'rotar.html')

def unlock_pdf_view(request):
    """Vista para remover contraseña de PDFs protegidos"""
    if request.method == 'POST':
        uploaded_file = request.FILES.get('pdf_file')
        password = request.POST.get('password')

        # Validaciones básicas
        if not uploaded_file:
            return JsonResponse({"status": "error", "message": "No se seleccionó ningún archivo PDF."}, status=400)

        if not uploaded_file.name.lower().endswith('.pdf'):
            return JsonResponse({"status": "error", "message": "El archivo debe ser un PDF válido."}, status=400)

        if not password or not password.strip():
            return JsonResponse({"status": "error", "message": "La contraseña es requerida."}, status=400)

        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        input_pdf_path = None
        output_pdf_path = None
        
        try:
            # Guardar archivo temporal de entrada
            input_filename = fs.save(uploaded_file.name, uploaded_file)
            input_pdf_path = fs.path(input_filename)
            
            # Verificar primero si el PDF está protegido
            pdf_info = pdf_processor.verificar_pdf_protegido(input_pdf_path)
            
            if pdf_info['error']:
                return JsonResponse({"status": "error", "message": f"Error al verificar PDF: {pdf_info['error']}"}, status=400)
            
            if not pdf_info['is_encrypted']:
                return JsonResponse({"status": "error", "message": "El PDF no está protegido con contraseña."}, status=400)
            
            # Crear nombre para archivo de salida
            base_name, ext = os.path.splitext(uploaded_file.name)
            clean_base_name = pdf_processor.clean_filename(base_name)
            output_filename = f"{clean_base_name}_sin_contraseña{ext}"
            output_pdf_path = os.path.join(settings.MEDIA_ROOT, output_filename)
            
            print(f"Intentando remover contraseña del PDF: {uploaded_file.name}")
            print(f"Tamaño del archivo: {pdf_info['file_size']} bytes")
            
            # Llamar a la función para remover contraseña
            success = pdf_processor.remover_contraseña_pdf(
                input_pdf_path, 
                output_pdf_path, 
                password.strip()
            )
            
            if success:
                # Verificar que el archivo de salida se creó correctamente
                if not os.path.exists(output_pdf_path):
                    return JsonResponse({"status": "error", "message": "No se pudo generar el archivo sin contraseña."}, status=500)
                
                output_size = os.path.getsize(output_pdf_path)
                if output_size == 0:
                    return JsonResponse({"status": "error", "message": "El archivo generado está vacío."}, status=500)
                
                print(f"✅ Contraseña removida exitosamente. Archivo de salida: {output_size} bytes")
                
                # Leer y enviar el archivo
                with open(output_pdf_path, 'rb') as pdf_file:
                    file_content = pdf_file.read()
                    
                response = HttpResponse(file_content, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{output_filename}"'
                
                return response
            else:
                return JsonResponse({"status": "error", "message": "No se pudo remover la contraseña del PDF."}, status=500)

        except ValueError as e:
            # Errores de validación (contraseña incorrecta, etc.)
            error_msg = str(e)
            if "contraseña incorrecta" in error_msg.lower():
                return JsonResponse({"status": "error", "message": "Contraseña incorrecta. Verifica e intenta nuevamente."}, status=400)
            elif "no está protegido" in error_msg.lower():
                return JsonResponse({"status": "error", "message": "El PDF no está protegido con contraseña."}, status=400)
            else:
                return JsonResponse({"status": "error", "message": error_msg}, status=400)
                
        except FileNotFoundError as e:
            return JsonResponse({"status": "error", "message": "Archivo no encontrado."}, status=404)
            
        except Exception as e:
            print(f"❌ ERROR en unlock_pdf_view: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({"status": "error", "message": f"Error inesperado: {str(e)}"}, status=500)
            
        finally:
            if input_pdf_path and os.path.exists(input_pdf_path):
                try:
                    os.remove(input_pdf_path)
                    print(f"Archivo temporal de entrada eliminado: {input_pdf_path}")
                except OSError as e:
                    print(f"Error eliminando archivo temporal de entrada: {e}")
                    
            if output_pdf_path and os.path.exists(output_pdf_path):
                try:
                    os.remove(output_pdf_path)
                    print(f"Archivo temporal de salida eliminado: {output_pdf_path}")
                except OSError as e:
                    print(f"Error eliminando archivo temporal de salida: {e}")

    return render(request, 'unlock.html')

def check_pdf_status(request):
    """Vista AJAX para verificar si un PDF está protegido"""
    if request.method == 'POST':
        uploaded_file = request.FILES.get('pdf_file')
        
        if not uploaded_file:
            return JsonResponse({"status": "error", "message": "No se proporcionó archivo"}, status=400)
        
        if not uploaded_file.name.lower().endswith('.pdf'):
            return JsonResponse({"status": "error", "message": "El archivo debe ser un PDF"}, status=400)
        
        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        temp_path = None
        
        try:
            # Guardar temporalmente para verificar
            temp_filename = fs.save(f"temp_check_{uploaded_file.name}", uploaded_file)
            temp_path = fs.path(temp_filename)
            
            # Verificar estado del PDF
            pdf_info = pdf_processor.verificar_pdf_protegido(temp_path)
            
            return JsonResponse({
                "status": "success",
                "data": {
                    "is_encrypted": pdf_info['is_encrypted'],
                    "needs_password": pdf_info['needs_password'],
                    "total_pages": pdf_info['total_pages'],
                    "file_size": pdf_info['file_size'],
                    "file_size_formatted": format_file_size(pdf_info['file_size']),
                    "error": pdf_info['error']
                }
            })
            
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
            
        finally:
            # Limpiar archivo temporal
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
    
    return JsonResponse({"status": "error", "message": "Método no permitido"}, status=405)

def format_file_size(bytes_size):
    """Formatea el tamaño de archivo en formato legible"""
    if bytes_size == 0:
        return "0 Bytes"
    
    k = 1024
    sizes = ["Bytes", "KB", "MB", "GB"]
    i = 0
    
    while bytes_size >= k and i < len(sizes) - 1:
        bytes_size /= k
        i += 1
    
    return f"{bytes_size:.2f} {sizes[i]}"

def convert_images_to_pdf_view(request):
    if request.method == 'POST':
        uploaded_files = request.FILES.getlist('image_files')
        
        if not uploaded_files:
            return JsonResponse({"status": "error", "message": "No se seleccionaron archivos de imagen."}, status=400)

        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        temp_image_paths = []
        output_pdf_path = None

        try:
            for uploaded_file in uploaded_files:
                filename = fs.save(uploaded_file.name, uploaded_file)
                temp_image_paths.append(fs.path(filename))

            # Obtener la configuración directamente de request.POST
            page_size = request.POST.get('page_size', 'A4')
            orientation = request.POST.get('orientation', 'portrait')
            margins = request.POST.get('margins', 'standard')
            fit_mode = request.POST.get('image_fit', 'fit') 

            # Llamar a la función de conversión con los parámetros del formulario
            output_pdf_path = pdf_processor.convert_images_to_pdf_with_options(
                temp_image_paths, 
                os.path.join(settings.MEDIA_ROOT, 'output.pdf'),
                page_size,
                orientation,
                margins,
                fit_mode
            )

            if output_pdf_path and os.path.exists(output_pdf_path):
                with open(output_pdf_path, 'rb') as pdf_file:
                    pdf_content = pdf_file.read()

                response = HttpResponse(pdf_content, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="imagenes_a_pdf.pdf"'
                return response
            else:
                return JsonResponse({"status": "error", "message": "La conversión falló o no se generó el archivo PDF."}, status=500)

        except Exception as e:
            # Captura y reporta errores más detallados
            return JsonResponse({"status": "error", "message": f"Ocurrió un error inesperado durante la conversión: {str(e)}"}, status=500)
        finally:
            # Borrar todas las imágenes originales subidas
            for path in temp_image_paths:
                try:
                    if os.path.exists(path):
                        os.remove(path)
                except Exception:
                    pass

            # Buscar y borrar imágenes temporales (_temp)
            for file in os.listdir(settings.MEDIA_ROOT):
                if "_temp" in file:
                    try:
                        os.remove(os.path.join(settings.MEDIA_ROOT, file))
                    except Exception:
                        pass

            # Borrar el PDF generado
            if output_pdf_path and os.path.exists(output_pdf_path):
                try:
                    os.remove(output_pdf_path)
                except Exception:
                    pass
                               
    return render(request, 'imagen_a_pdf.html')