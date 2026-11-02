# Publicar una presentación

1. Abre el [editor](https://legencymx.github.io/legency-presentaciones-web/editor.html).
2. Ajusta las diapositivas. Los cambios quedan como borrador en tu navegador.
3. Haz clic en **1. Descargar versión**. Se descargará `published.json`.
4. Haz clic en **2. Publicar (invitados)**. Inicia sesión en GitHub con una cuenta invitada al repositorio, arrastra `published.json` a esa página y confirma el cambio.
5. Cuando GitHub termine de publicar, abre la [presentación](https://legencymx.github.io/legency-presentaciones-web/) y recarga la página.

Solo las cuentas invitadas con acceso de escritura pueden completar el paso 4. Cualquier visitante puede preparar una copia local y descargarla, pero no cambiar la versión compartida.

Para un MP4 o una imagen de más de 2 MB: súbelo primero a `reference/assets/` en el mismo repositorio; luego, en el editor, pega la ruta `reference/assets/nombre-del-archivo.mp4` en el campo **URL de medio ya alojado**. Después publica `published.json`.

GitHub conserva el historial de versiones. Si una publicación sale mal, restaura `published.json` desde un commit anterior.
