; ECHO.COM — dos-mcp integration-test smoke bundle.
; Reads one keystroke (int 16h) and echoes it to screen (int 10h).
; Exits on F10 (scancode 44h).

        org 100h
start:  mov ah, 0          ; BIOS read key
        int 16h             ; AL=ASCII, AH=scancode

        cmp ah, 44h         ; F10?
        je  done

        cmp al, 0           ; ignore pure-scancode keys (like arrows)
        je  start

        mov ah, 0eh         ; BIOS teletype write
        mov bx, 0007h       ; page 0, attr 7
        int 10h
        jmp start

done:   mov ax, 4c00h       ; DOS exit
        int 21h
