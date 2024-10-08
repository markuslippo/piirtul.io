package main

import (
	"io"
	"net/http"
	"os"
	"text/template"

	"github.com/labstack/echo/v4"
	log "github.com/sirupsen/logrus"
)

func init() {
	log.SetFormatter(&log.JSONFormatter{})
	log.SetOutput(os.Stdout)
}

type Template struct {
	templates *template.Template
}

func (t *Template) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	return t.templates.ExecuteTemplate(w, name, data)
}

func staticRender(template string) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.Render(http.StatusOK, template, nil)
	}
}

func main() {
	e := echo.New()
	e.Renderer = &Template{
		templates: template.Must(template.ParseFS(os.DirFS("."), "views/*.html")),
	}

	roomService := &RoomService{
		DB: &RoomSlice{
			data: make([]Room, 0),
		},
	}
	e.Use(roomService.Use)

	e.Static("/static", "assets")

	e.GET("/", staticRender("landing"))

	e.Logger.Fatal(e.Start(":8080"))
}

// Ugrade policty from http request to websocket
// TODO: to be defined
/* ss := SignalingServer{
	users: []*User{},
	upgrader: websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	},
}
http.HandleFunc("/get", ss.Handler)
log.Info("Signaling Server started")
err := http.ListenAndServe(":9090", nil)
if err != nil {
	log.Panic(err)
}*/
