Funcion binario <- Binario8(numero)

    Definir binario Como Cadena
    Definir i, bit Como Entero

    binario <- ""

    Para i <- 1 Hasta 8 Hacer
        bit <- numero MOD 2
        binario <- ConvertirATexto(bit) + binario
        numero <- Trunc(numero / 2)
    FinPara

FinFuncion


Funcion binario <- Binario4(numero)

    Definir binario Como Cadena
    Definir i, bit Como Entero

    binario <- ""

    Para i <- 1 Hasta 4 Hacer
        bit <- numero MOD 2
        binario <- ConvertirATexto(bit) + binario
        numero <- Trunc(numero / 2)
    FinPara

FinFuncion


Proceso CalculadoraVonNeumann

    Definir memoria Como Entero
    Dimension memoria[16]

    Definir opcion, PC, IR, MAR, MDR Como Entero
    Definir codigo, direccion, AC, RE, paso, i Como Entero
    Definir finalizado Como Logico
    Definir nombreOperacion Como Cadena

    Repetir

        Limpiar Pantalla

        Escribir "==============================================="
        Escribir "   CALCULADORA DE VON NEUMANN - 8 BITS"
        Escribir "==============================================="
        Escribir ""
        Escribir "FORMATO: [ OPERACION (4 bits) ][ DIRECCION (4 bits) ]"
        Escribir ""
        Escribir "TABLA DE OPERACIONES"
        Escribir "0000  +  Sumar"
        Escribir "0001  -  Restar"
        Escribir "0010  *  Producto (no implementado)"
        Escribir "0011  ^  Exponente (no implementado)"
        Escribir "0100  &  AND (no implementado)"
        Escribir "0101  |  OR (no implementado)"
        Escribir "0110  M  Mover el AC a memoria"
        Escribir "0111  ... Finalizar programa"
        Escribir "1000  C  Cargar un dato desde memoria al AC"
        Escribir ""
        Escribir "EJEMPLOS PRECARGADOS"
        Escribir "1. 5 + 11"
        Escribir "2. 10 - 2"
        Escribir "3. Salir"
        Escribir ""
        Escribir "Seleccione una opcion:"
        Leer opcion

        Si opcion = 1 O opcion = 2 Entonces

            // Limpiar toda la memoria
            Para i <- 1 Hasta 15 Hacer
                memoria[i] <- 0
            FinPara

            Si opcion = 1 Entonces

                // Ejemplo: 5 + 11
                memoria[1] <- 134     // 1000 0110 -> Cargar memoria[6]
                memoria[2] <- 7       // 0000 0111 -> Sumar memoria[7]
                memoria[3] <- 104     // 0110 1000 -> Guardar en memoria[8]
                memoria[4] <- 112     // 0111 0000 -> Finalizar

                memoria[6] <- 5
                memoria[7] <- 11
                memoria[8] <- 0

            SiNo

                // Ejemplo: 10 - 2
                memoria[1] <- 134     // 1000 0110 -> Cargar memoria[6]
                memoria[2] <- 23      // 0001 0111 -> Restar memoria[7]
                memoria[3] <- 104     // 0110 1000 -> Guardar en memoria[8]
                memoria[4] <- 112     // 0111 0000 -> Finalizar

                memoria[6] <- 10
                memoria[7] <- 2
                memoria[8] <- 0

            FinSi

            PC <- 1
            AC <- 0
            RE <- 0
            paso <- 1
            finalizado <- Falso

            Limpiar Pantalla
            Escribir "========== TABLA DE MEMORIA INICIAL =========="

            Para i <- 1 Hasta 8 Hacer
                Escribir "Posicion ", i, " --> ", Binario8(memoria[i]), " --> ", memoria[i]
            FinPara

            Escribir ""
            Escribir "AC inicia en: ", AC
            Escribir "Presione una tecla para iniciar..."
            Esperar Tecla

            Mientras finalizado = Falso Hacer

    Limpiar Pantalla

    Escribir "======================================================"
    Escribir "       SIMULACION DE ARQUITECTURA VON NEUMANN"
    Escribir "======================================================"
    Escribir ""
    Escribir "PASO ", paso
    Escribir ""

    // ---------------------------------------------
    // 1. BUSQUEDA DE LA INSTRUCCION
    // ---------------------------------------------
    Escribir "------------------------------------------------------"
    Escribir "1. UNIDAD DE CONTROL: BUSQUEDA DE INSTRUCCION"
    Escribir "------------------------------------------------------"
    Escribir ""
    Escribir "El Contador de Programa (PC) indica donde leer."
    Escribir ""
    Escribir "PC = ", PC
    Escribir ""
    Escribir "PC ", PC, "  ---------->  MAR"
    Escribir "                         "
    Escribir "MAR recibe la direccion ", PC

    MAR <- PC

    Escribir ""
    Escribir "MAR ", MAR, " ----------> Memoria[", MAR, "]"
    Escribir "Memoria[", MAR, "] contiene: ", Binario8(memoria[MAR])
    Escribir ""
    Escribir "Memoria[", MAR, "] ----------> MDR"
    MDR <- memoria[MAR]

    Escribir "MDR = ", Binario8(MDR)
    Escribir ""
    Escribir "MDR ----------> IR"
    IR <- MDR

    Escribir "IR = ", Binario8(IR)
    Escribir ""
    Escribir "PC ", PC, " ----------> PC ", PC + 1
    PC <- PC + 1

    // ---------------------------------------------
    // 2. DECODIFICACION
    // ---------------------------------------------
    Escribir ""
    Escribir "------------------------------------------------------"
    Escribir "2. DECODIFICADOR: INTERPRETAR LA INSTRUCCION"
    Escribir "------------------------------------------------------"
    Escribir ""
    Escribir "La instruccion tiene 8 bits:"
    Escribir ""
    Escribir "     ", Binario8(IR)
    Escribir "     ---- ----"
    Escribir "      OP   DIR"
    Escribir ""
    Escribir "OP  = los primeros 4 bits: operacion"
    Escribir "DIR = los ultimos 4 bits: direccion de memoria"

    codigo <- Trunc(IR / 16)
    direccion <- IR MOD 16

    Escribir ""
    Escribir "OP  = ", Binario4(codigo)
    Escribir "DIR = ", Binario4(direccion), "  --> direccion decimal ", direccion

    Segun codigo Hacer

        0:
            nombreOperacion <- "SUMA"
            Escribir ""
            Escribir "DECODIFICADOR:"
            Escribir "0000 significa SUMAR."
            Escribir "La ALU sumara el valor de memoria[", direccion, "] al AC."

        1:
            nombreOperacion <- "RESTA"
            Escribir ""
            Escribir "DECODIFICADOR:"
            Escribir "0001 significa RESTAR."
            Escribir "La ALU restara el valor de memoria[", direccion, "] al AC."

        6:
            nombreOperacion <- "MOVER A MEMORIA"
            Escribir ""
            Escribir "DECODIFICADOR:"
            Escribir "0110 significa GUARDAR."
            Escribir "El valor del AC se guardara en memoria[", direccion, "]."

        7:
            nombreOperacion <- "FINALIZAR"
            Escribir ""
            Escribir "DECODIFICADOR:"
            Escribir "0111 significa FINALIZAR."
            Escribir "La Unidad de Control detendra el programa."

        8:
            nombreOperacion <- "CARGAR DESDE MEMORIA"
            Escribir ""
            Escribir "DECODIFICADOR:"
            Escribir "1000 significa CARGAR."
            Escribir "El valor de memoria[", direccion, "] se llevara al AC."

        De Otro Modo:
            nombreOperacion <- "ERROR"
            Escribir "Instruccion no reconocida."

    FinSegun

    // ---------------------------------------------
    // 3. EJECUCION EN LA ALU
    // ---------------------------------------------
    Escribir ""
    Escribir "------------------------------------------------------"
    Escribir "3. ALU: EJECUCION DE LA OPERACION"
    Escribir "------------------------------------------------------"
    Escribir ""
    Escribir "Acumulador antes de ejecutar:"
    Escribir "AC = ", Binario8(AC), "  --> decimal ", AC
    Escribir ""

    Segun codigo Hacer

        8:
            Escribir "CARGAR:"
            Escribir "Memoria[", direccion, "] = ", Binario8(memoria[direccion])
            Escribir ""
            Escribir "Memoria[", direccion, "] ----------> Registro de Entrada (RE)"
            RE <- memoria[direccion]

            Escribir "RE = ", Binario8(RE), "  --> decimal ", RE
            Escribir ""
            Escribir "RE ----------> AC"
            AC <- RE

            Escribir "AC ahora contiene: ", AC

        0:
            Escribir "SUMA:"
            Escribir "Memoria[", direccion, "] = ", Binario8(memoria[direccion])
            Escribir ""
            Escribir "Memoria[", direccion, "] ----------> Registro de Entrada (RE)"
            RE <- memoria[direccion]

            Escribir "RE = ", RE
            Escribir ""
            Escribir "AC + RE ----------> AC"
            Escribir AC, " + ", RE, " = ", AC + RE

            AC <- AC + RE

            Escribir "Nuevo AC = ", Binario8(AC), "  --> decimal ", AC

        1:
            Escribir "RESTA:"
            Escribir "Memoria[", direccion, "] = ", Binario8(memoria[direccion])
            Escribir ""
            Escribir "Memoria[", direccion, "] ----------> Registro de Entrada (RE)"
            RE <- memoria[direccion]

            Escribir "RE = ", RE
            Escribir ""
            Escribir "AC - RE ----------> AC"
            Escribir AC, " - ", RE, " = ", AC - RE

            AC <- AC - RE

            Escribir "Nuevo AC = ", Binario8(AC), "  --> decimal ", AC

        6:
            Escribir "MOVER A MEMORIA:"
            Escribir ""
            Escribir "AC = ", AC
            Escribir ""
            Escribir "AC ----------> MDR"
            MDR <- AC

            Escribir "MDR = ", Binario8(MDR)
            Escribir ""
            Escribir "MDR ----------> Memoria[", direccion, "]"
            memoria[direccion] <- MDR

            Escribir "Resultado guardado en memoria[", direccion, "]"

        7:
            Escribir "FINALIZAR:"
            Escribir ""
            Escribir "Unidad de Control ----------> FIN DEL PROGRAMA"
            finalizado <- Verdadero

        De Otro Modo:
            Escribir "No se puede ejecutar esta instruccion."
            finalizado <- Verdadero

    FinSegun

    // ---------------------------------------------
    // 4. ESTADO ACTUAL
    // ---------------------------------------------
    Escribir ""
    Escribir "------------------------------------------------------"
    Escribir "4. ESTADO ACTUAL DEL SISTEMA"
    Escribir "------------------------------------------------------"
    Escribir ""
    Escribir "UNIDAD DE CONTROL"
    Escribir "PC: ", PC
    Escribir "IR: ", Binario8(IR), "  --> ", nombreOperacion
    Escribir ""
    Escribir "MEMORIA"
    Escribir "MAR: ", MAR
    Escribir "MDR: ", Binario8(MDR)
    Escribir ""
    Escribir "ALU"
    Escribir "AC: ", Binario8(AC), "  --> decimal ", AC
    Escribir "RE: ", Binario8(RE), "  --> decimal ", RE
    Escribir ""

    Escribir "TABLA DE MEMORIA"
    Escribir "Posicion     Binario       Decimal"
    Para i <- 1 Hasta 8 Hacer
        Escribir "   ", i, "        ", Binario8(memoria[i]), "        ", memoria[i]
    FinPara

    paso <- paso + 1

    Si finalizado = Falso Entonces
        Escribir ""
        Escribir "Presione una tecla para ejecutar la siguiente instruccion..."
        Esperar Tecla
    FinSi

FinMientras

Escribir ""
Escribir "======================================================"
Escribir "               RESULTADO FINAL"
Escribir "======================================================"
Escribir ""
Escribir "El programa llego a la instruccion 0111: FINALIZAR."
Escribir ""
Escribir "El resultado fue guardado en memoria[8]."
Escribir ""
Escribir "memoria[8] = ", Binario8(memoria[8])
Escribir "memoria[8] = ", memoria[8], " en decimal"
Escribir ""
Escribir "El AC termino con el valor: ", AC
Escribir "======================================================"
Esperar Tecla

        FinSi

    Hasta Que opcion = 3

FinProceso