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

                Escribir "==============================================="
                Escribir "PASO ", paso
                Escribir "==============================================="

                // FETCH: buscar instrucción
                Escribir ""
                Escribir "1. BUSQUEDA DE INSTRUCCION (FETCH)"
                Escribir "Unidad de control:"
                Escribir "PC = ", PC
                Escribir "PC --> MAR"
                MAR <- PC

                Escribir "MAR = ", MAR
                Escribir "Memoria[", MAR, "] --> MDR"
                MDR <- memoria[MAR]

                Escribir "MDR = ", Binario8(MDR), " (", MDR, ")"
                Escribir "MDR --> IR"
                IR <- MDR

                Escribir "IR = ", Binario8(IR)
                Escribir "PC --> PC + 1"
                PC <- PC + 1

                // DECODE: separar operación y dirección
                Escribir ""
                Escribir "2. DECODIFICACION"
                codigo <- Trunc(IR / 16)
                direccion <- IR MOD 16

                Escribir "IR = ", Binario8(IR)
                Escribir "Operacion = ", Binario4(codigo)
                Escribir "Direccion = ", Binario4(direccion), " --> ", direccion

                Segun codigo Hacer
                    0:
                        nombreOperacion <- "SUMAR"
                    1:
                        nombreOperacion <- "RESTAR"
                    6:
                        nombreOperacion <- "MOVER A MEMORIA"
                    7:
                        nombreOperacion <- "FINALIZAR"
                    8:
                        nombreOperacion <- "CARGAR DESDE MEMORIA"
                    De Otro Modo:
                        nombreOperacion <- "INSTRUCCION NO VALIDA"
                FinSegun

                Escribir "Decodificador --> ", nombreOperacion

                // EXECUTE: ejecutar instrucción
                Escribir ""
                Escribir "3. EJECUCION"
                Escribir "ALU:"
                Escribir "AC antes = ", AC

                Segun codigo Hacer

                    8:
                        // Cargar
                        Escribir "Memoria[", direccion, "] --> Registro de Entrada"
                        RE <- memoria[direccion]

                        Escribir "RE = ", Binario8(RE), " (", RE, ")"
                        Escribir "RE --> AC"
                        AC <- RE

                    0:
                        // Suma
                        Escribir "Memoria[", direccion, "] --> Registro de Entrada"
                        RE <- memoria[direccion]

                        Escribir "RE = ", Binario8(RE), " (", RE, ")"
                        Escribir "AC + RE --> AC"
                        AC <- AC + RE

                    1:
                        // Resta
                        Escribir "Memoria[", direccion, "] --> Registro de Entrada"
                        RE <- memoria[direccion]

                        Escribir "RE = ", Binario8(RE), " (", RE, ")"
                        Escribir "AC - RE --> AC"
                        AC <- AC - RE

                    6:
                        // Mover a memoria
                        Escribir "AC --> MDR"
                        MDR <- AC

                        Escribir "MDR --> Memoria[", direccion, "]"
                        memoria[direccion] <- MDR

                    7:
                        // Finalizar
                        Escribir "La unidad de control recibe HALT"
                        finalizado <- Verdadero

                    De Otro Modo:
                        Escribir "Operacion no implementada"
                        finalizado <- Verdadero

                FinSegun

                Escribir "AC despues = ", AC
                Escribir ""

                Escribir "4. TABLA DE MEMORIA ACTUAL"
                Para i <- 1 Hasta 8 Hacer
                    Escribir "Posicion ", i, " --> ", Binario8(memoria[i]), " --> ", memoria[i]
                FinPara

                paso <- paso + 1

                Si finalizado = Falso Entonces
                    Escribir ""
                    Escribir "Presione una tecla para el siguiente paso..."
                    Esperar Tecla
                FinSi

            FinMientras

            Escribir ""
            Escribir "==============================================="
            Escribir "PROGRAMA FINALIZADO"
            Escribir "Resultado guardado en memoria[8]: ", memoria[8]
            Escribir "Binario: ", Binario8(memoria[8])
            Escribir "==============================================="
            Esperar Tecla

        FinSi

    Hasta Que opcion = 3

FinProceso